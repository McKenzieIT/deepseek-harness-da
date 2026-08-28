"""
CPython subprocess bootstrap for dsh-code-runtime-data-python.

Entry point: the Node host spawns `python3 bootstrap.py` with fd 3 as the
framed-JSON channel. This bootstrap:
  1. Reads the boot message (caps + namespace declarations).
  2. Applies RLIMIT_CPU and RLIMIT_AS (POSIX only; skipped on Windows).
  3. Sends boot-ack.
  4. Reads the run message (program body).
  5. Executes the program as an async function body with materialized bindings.
  6. Sends done (value | error).

Trust posture: containment, not security boundary. Same as worker-thread —
binding-only I/O is the primary containment layer; rlimits are resource
protection (not a security boundary).
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import platform
import sys
import tokenize
import traceback
from typing import Any

PROTOCOL_FD = 3

# --- fd-3 channel I/O ---

_write_fd: io.FileIO | None = None
_read_file: io.TextIOWrapper | None = None


def _open_channel() -> tuple[io.TextIOWrapper, io.FileIO]:
    """Open fd 3 for reading (text, line-buffered) and writing (binary)."""
    read_file = io.TextIOWrapper(io.BufferedReader(io.FileIO(PROTOCOL_FD, "r")), encoding="utf-8")
    write_fd = io.FileIO(PROTOCOL_FD, "w")
    return read_file, write_fd


def _send(frame: dict[str, Any]) -> None:
    """Write one JSON-lines frame to fd 3."""
    assert _write_fd is not None
    line = json.dumps(frame, ensure_ascii=False, separators=(",", ":"))
    _write_fd.write((line + "\n").encode("utf-8"))
    _write_fd.flush()


def _recv() -> dict[str, Any]:
    """Read one JSON-lines frame from fd 3."""
    assert _read_file is not None
    line = _read_file.readline()
    if not line:
        raise EOFError("fd-3 channel closed by host")
    return json.loads(line)


# --- Log capture ---


class LogBuffer:
    """Metered log capture that streams each entry to fd 3 eagerly."""

    def __init__(self, max_bytes: int) -> None:
        self._max_bytes = max_bytes
        self._bytes = 2  # empty JSON array: []
        self._entries = 0
        self._truncated = False

    @property
    def truncated(self) -> bool:
        return self._truncated

    @property
    def remaining_bytes(self) -> int:
        return self._max_bytes - self._bytes

    def push(self, text: str) -> None:
        if self._truncated:
            return
        encoded = json.dumps(text, ensure_ascii=False)
        string_bytes = len(encoded.encode("utf-8"))
        separator_bytes = 1 if self._entries > 0 else 0
        if self._bytes + string_bytes + separator_bytes > self._max_bytes:
            self._truncated = True
            _send({"type": "log", "text": _log_truncation_marker(self._max_bytes), "truncated": True})
            return
        self._bytes += string_bytes + separator_bytes
        self._entries += 1
        _send({"type": "log", "text": text})


def _log_truncation_marker(max_bytes: int) -> str:
    return f"[dsh-code-runtime-python] log capture truncated at {max_bytes} bytes"


# --- Resource limits (POSIX only) ---


def _apply_rlimits(cpu_seconds: int, address_space_bytes: int) -> None:
    """Apply RLIMIT_CPU and RLIMIT_AS. No-op on non-POSIX (Windows)."""
    if platform.system() == "Windows":
        return
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_AS, (address_space_bytes, address_space_bytes))
    except (ImportError, OSError, ValueError):
        # resource module unavailable or setrlimit not supported (some containers)
        pass


# --- Binding namespace materialization ---


class _BindingError(Exception):
    """Program-visible rejection for a binding call."""

    def __init__(self, class_name: str, member_name: str, member_property: str, message: str) -> None:
        super().__init__(message)
        self.name = class_name
        setattr(self, member_property, member_name)


def _make_binding_namespaces(
    namespaces: list[dict[str, Any]],
    call_binding: Any,
) -> tuple[dict[str, Any], dict[str, type]]:
    """Build the program-visible namespace objects and error classes.

    Returns (globals_dict, error_classes_dict) where:
      - globals_dict maps namespace global name -> namespace object
      - error_classes_dict maps error class name -> error class
    """
    globals_dict: dict[str, Any] = {}
    error_classes: dict[str, type] = {}

    for ns in namespaces:
        ns_global = ns["global"]
        names = ns["names"]
        error_class_desc = ns.get("errorClass")

        error_class: type | None = None
        if error_class_desc:
            class_name = error_class_desc["name"]
            member_property = error_class_desc["memberNameProperty"]

            def make_error_cls(cn: str, mp: str) -> type:
                class BindingCallError(_BindingError):
                    def __init__(self, member_name: str, message: str) -> None:
                        super().__init__(cn, member_name, mp, message)

                BindingCallError.__name__ = cn
                BindingCallError.__qualname__ = cn
                return BindingCallError

            error_class = make_error_cls(class_name, member_property)
            error_classes[class_name] = error_class

        namespace_obj = _Namespace(ns_global, names, call_binding, error_class)
        globals_dict[ns_global] = namespace_obj

    return globals_dict, error_classes


class _Namespace:
    """A program-visible binding namespace with async callable members."""

    def __init__(
        self,
        global_name: str,
        names: list[str],
        call_binding: Any,
        error_class: type | None,
    ) -> None:
        self._global = global_name
        self._call_binding = call_binding
        self._error_class = error_class
        for name in names:
            setattr(self, name, self._make_method(name))

    def _make_method(self, name: str) -> Any:
        async def method(args: Any = None) -> Any:
            return await self._call_binding(self._global, name, args, self._error_class)

        method.__name__ = name
        method.__qualname__ = f"{self._global}.{name}"
        return method


# --- Value validation ---


def _is_json_safe(value: Any) -> bool:
    """Check if a value is lossless JSON (no non-finite floats, no bytes, etc.)."""
    stack: list[Any] = [value]
    while stack:
        current = stack.pop()
        if current is None or isinstance(current, (bool, int, str)):
            continue
        if isinstance(current, float):
            if not (current == current and current != float("inf") and current != float("-inf")):
                return False
            continue
        if isinstance(current, list):
            stack.extend(current)
            continue
        if isinstance(current, dict):
            for k, v in current.items():
                if not isinstance(k, str):
                    return False
                stack.append(v)
            continue
        return False
    return True


def _check_value_bytes(value: Any, max_bytes: int) -> bool:
    """Check if the JSON serialization of value fits within max_bytes."""
    try:
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        return len(encoded.encode("utf-8")) <= max_bytes
    except (TypeError, ValueError, OverflowError):
        return False


def _indent_body(program: str) -> str:
    """Indent the program body by 2 spaces for inclusion under
    ``async def __dsh_main__``, without altering whitespace inside multi-line
    string literals (their interior lines are data, not code)."""
    lines = program.split("\n")
    # Lines that fall strictly inside a multi-line string literal must not be
    # re-indented — their leading whitespace is part of the string value.
    skip: set[int] = set()
    string_types: set[int] = {tokenize.STRING}
    fstring_middle = getattr(tokenize, "FSTRING_MIDDLE", None)
    if fstring_middle is not None:
        string_types.add(fstring_middle)
    try:
        reader = io.StringIO(program).readline
        for tok in tokenize.generate_tokens(reader):
            if tok.type in string_types and tok.end[0] > tok.start[0]:
                start_row = tok.start[0]  # 1-indexed
                end_row = tok.end[0]      # 1-indexed
                for row in range(start_row + 1, end_row + 1):
                    skip.add(row - 1)  # convert to 0-indexed
    except tokenize.TokenError:
        # Unterminated string or other tokenization error: fall back to the
        # naive per-line indent (the program will fail at compile() anyway).
        pass

    result: list[str] = []
    for i, line in enumerate(lines):
        if i in skip or not line.strip():
            result.append(line)
        else:
            result.append("  " + line)
    return "\n".join(result)


# --- Main execution ---


async def _run_program(
    program: str,
    namespaces_dict: dict[str, Any],
    error_classes: dict[str, type],
    logs: LogBuffer,
    max_value_bytes: int,
) -> None:
    """Execute the model program as an async function body and send done."""
    # Build the async function with namespace globals + error classes + print shim
    param_names = list(namespaces_dict.keys()) + list(error_classes.keys())
    param_values = list(namespaces_dict.values()) + list(error_classes.values())

    # print shim captures to logs
    def print_shim(*args: Any, sep: str = " ", end: str = "\n", **_kwargs: Any) -> None:
        text = sep.join(str(a) for a in args) + end
        if text.endswith("\n"):
            text = text[:-1]
        if text:
            logs.push(text)

    # Provide pandas and numpy in the program's namespace
    extra_globals: dict[str, Any] = {"print": print_shim}
    try:
        import pandas as pd

        extra_globals["pd"] = pd
        extra_globals["pandas"] = pd
    except ImportError:
        pass
    try:
        import numpy as np

        extra_globals["np"] = np
        extra_globals["numpy"] = np
    except ImportError:
        pass

    # Compile the program as an async function body
    func_params = ", ".join(param_names) if param_names else ""
    func_source = f"async def __dsh_main__({func_params}):\n"
    # Indent the program body without altering whitespace inside multi-line
    # string literals (their interior lines are data, not code).
    func_source += _indent_body(program)

    local_ns: dict[str, Any] = {}
    try:
        exec(compile(func_source, "<dsh-program>", "exec"), extra_globals, local_ns)
    except SyntaxError as e:
        _send({"type": "done", "error": {"kind": "exception", "message": f"SyntaxError: {e}"}})
        return

    main_fn = local_ns["__dsh_main__"]

    try:
        result = await main_fn(*param_values)
    except _BindingError:
        # Re-raise binding errors as program exceptions with traceback
        tb = traceback.format_exc()
        _send({"type": "done", "error": {"kind": "exception", "message": tb}})
        return
    except Exception:
        tb = traceback.format_exc()
        _send({"type": "done", "error": {"kind": "exception", "message": tb}})
        return

    # Process the return value
    if result is None:
        _send({"type": "done"})
        return

    if not _is_json_safe(result):
        _send({"type": "done", "error": {"kind": "invalid-output", "message": "program completion must be lossless JSON"}})
        return

    # The completion value is capped against the VALUE budget alone, matching
    # the host's `checkDoneValue(frame.value, maxValueBytes)` and the separate
    # log/value budgets documented in Config. Do NOT couple it to the log
    # budget (`logs.remaining_bytes`): that would cap a 64 MiB value at the
    # 1 MiB log budget, 64x tighter than the documented maxValueBytes.
    if not _check_value_bytes(result, max_value_bytes):
        _send({"type": "done", "error": {"kind": "output-limit", "message": f"outer output exceeded {max_value_bytes} bytes"}})
        return

    _send({"type": "done", "value": result})


async def _main() -> None:
    global _write_fd, _read_file

    _read_file, _write_fd = _open_channel()

    # 1. Read boot message
    boot = _recv()
    assert boot["type"] == "boot", f"expected boot, got {boot.get('type')}"

    cpu_seconds: int = boot["cpuSeconds"]
    address_space_bytes: int = boot["addressSpaceBytes"]
    max_log_bytes: int = boot["maxLogBytes"]
    max_value_bytes: int = boot["maxValueBytes"]
    namespaces_decl: list[dict[str, Any]] = boot["namespaces"]

    # 2. Apply resource limits
    _apply_rlimits(cpu_seconds, address_space_bytes)

    # 3. Send boot-ack
    _send({"type": "boot-ack"})

    # 4. Read run message
    run_msg = _recv()
    assert run_msg["type"] == "run", f"expected run, got {run_msg.get('type')}"
    program: str = run_msg["program"]

    # 5. Set up log capture
    logs = LogBuffer(max_log_bytes)

    # 6. Set up binding call mechanism
    pending_calls: dict[int, tuple[asyncio.Future[Any], str, type | None]] = {}
    next_id = [1]

    async def call_binding(ns_global: str, name: str, args: Any, error_class: type | None) -> Any:
        if args is not None and not _is_json_safe(args):
            msg = "binding arguments must be lossless JSON"
            if error_class:
                raise error_class(name, msg)
            raise RuntimeError(msg)

        call_id = next_id[0]
        next_id[0] += 1

        future: asyncio.Future[Any] = asyncio.get_event_loop().create_future()
        pending_calls[call_id] = (future, name, error_class)

        frame: dict[str, Any] = {"type": "call", "id": call_id, "global": ns_global, "name": name, "args": args}
        _send(frame)

        result = await future
        return result

    def handle_reply(reply: dict[str, Any]) -> None:
        call_id = reply["id"]
        entry = pending_calls.pop(call_id, None)
        if entry is None:
            return
        future, name, error_class = entry
        if future.done():
            return
        if reply["ok"]:
            future.set_result(reply["value"])
        else:
            message = reply["message"]
            if error_class:
                future.set_exception(error_class(name, message))
            else:
                future.set_exception(RuntimeError(message))

    # 7. Materialize binding namespaces
    namespaces_dict, error_classes = _make_binding_namespaces(namespaces_decl, call_binding)

    # 8. Run the program with concurrent reply reading
    async def read_replies() -> None:
        """Read reply frames from fd 3 while the program runs."""
        while True:
            try:
                line = await asyncio.get_event_loop().run_in_executor(None, _read_file.readline)  # type: ignore[union-attr]
                if not line:
                    break
                frame = json.loads(line)
                if frame.get("type") == "reply":
                    handle_reply(frame)
            except (EOFError, json.JSONDecodeError, OSError):
                break

    reader_task = asyncio.create_task(read_replies())

    try:
        await _run_program(program, namespaces_dict, error_classes, logs, max_value_bytes)
    finally:
        reader_task.cancel()
        try:
            await reader_task
        except asyncio.CancelledError:
            pass


def main() -> None:
    # Redirect stdout/stderr so program prints go through the log buffer
    # (actual capture happens inside _run_program via the print shim;
    # raw writes to stdout/stderr from imported libraries are left as-is
    # and captured by the host via the subprocess pipes)
    try:
        asyncio.run(_main())
    except SystemExit:
        raise
    except BaseException as e:
        # Last-resort: if the bootstrap itself crashes, send a done/exception
        try:
            _send({"type": "done", "error": {"kind": "exception", "message": f"bootstrap crash: {e}"}})
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
