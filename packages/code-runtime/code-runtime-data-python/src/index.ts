/**
 * CPython subprocess CodeRuntime Provider for the data-agent. Spawns a fresh
 * CPython process per run with pandas/numpy available, communicates via the
 * existing fd-3 JSON-lines wire protocol, and provides containment (binding-only
 * I/O + resource limits) — the same trust posture as the worker-thread backend.
 *
 * @module @deepseek-ai/dsh-code-runtime-data-python
 */

import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { CodeRuntime, DUNDER_MEMBER, PORTABLE_RESERVED_WORDS, RESERVED_BINDING_GLOBALS, RESERVED_ERROR_MEMBERS } from '@deepseek-ai/dsh-code-runtime'
import type { CodeBindingNamespace, CodeJsonValue, CodeRunFailure, CodeRunRequest, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
import { checkDoneValue, encodeJsonPlain, hasNonLosslessNumber, hasUnsafeIntegerToken, jsonStringBytesUpTo, logTruncationMarker, validateChildFrame } from '@deepseek-ai/dsh-code-runtime-python'
import type { BootMessage, ReplyMessage } from '@deepseek-ai/dsh-code-runtime-python'
import { snapshotJsonValue } from '@deepseek-ai/dsh-session'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const BOOTSTRAP_PATH = fileURLToPath(new URL('../py/bootstrap.py', import.meta.url))

/**
 * Runtime caps for {@link DataPythonCodeRuntime}; every field has a
 * schemastery default, so all are optional on input. Units are mixed and
 * called out per field.
 */
export interface Config {
  /** RLIMIT_CPU seconds applied to the CPython bootstrap before model code runs. Default 30. */
  cpuSeconds?: number
  /** RLIMIT_AS bytes capping the child's address space (Linux-enforced; macOS ignores it). Default 2_147_483_648 (2 GiB). */
  addressSpaceBytes?: number
  /**
   * Wall-clock ceiling in milliseconds; the host SIGKILLs the child on
   * expiry. At most MAX_TIMER_DELAY_MS (Node's setTimeout clamp). Default
   * 600_000.
   */
  maxWallMs?: number
  /** Shared byte budget for captured log text (host + child ledgers). Default 1_048_576 (1 MiB). */
  maxLogBytes?: number
  /** Byte cap for the serialized completion value. Default 67_108_864 (64 MiB). */
  maxValueBytes?: number
  /** CPython interpreter invoked for the bootstrap (e.g. `python3`). Default `python3`. */
  pythonPath?: string
}

type ResolvedConfig = Required<Config>

interface LiveRun {
  child: ChildProcess
  settle(failure: CodeRunFailure): void
  finished: Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read newline-delimited frames from `input`, calling `onLine` only for lines
 * whose UTF-8 byte length does not exceed `maxBytes`. A line that exceeds the
 * cap is forged junk and is dropped wholesale — never buffered in full nor
 * passed to the caller (which runs an O(n) integer scan and `JSON.parse` on the
 * value). This is the host-side cap on inbound fd-3 frame size owned by the
 * runtime that reads the channel (protocol.ts `checkDoneValue` JSDoc).
 */
function createCappedLineReader(
  input: NodeJS.ReadableStream,
  maxBytes: number,
  onLine: (line: string) => void,
): void {
  let buffer = Buffer.alloc(0)
  input.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf(0x0a)) >= 0) {
      const lineBytes = buffer.subarray(0, newlineIndex)
      buffer = buffer.subarray(newlineIndex + 1)
      // Drop forged frames that exceed the byte cap before JSON.parse runs.
      if (lineBytes.length > maxBytes) continue
      onLine(lineBytes.toString('utf8'))
    }
    // If the unterminated tail already exceeds the cap, drop it so a single
    // oversized write cannot grow host memory without bound.
    if (buffer.length > maxBytes) {
      buffer = Buffer.alloc(0)
    }
  })
  input.on('end', () => {
    if (buffer.length > 0 && buffer.length <= maxBytes) {
      onLine(buffer.toString('utf8'))
    }
  })
}

/**
 * CPython subprocess {@link CodeRuntime} for the data-agent. Each run spawns a
 * fresh CPython process with pandas/numpy available, talks the fd-3 JSON-lines
 * wire protocol, and is contained by binding-only I/O plus rlimits — the same
 * trust posture as the worker-thread backend.
 */
export class DataPythonCodeRuntime extends CodeRuntime {
  static Config: z<Config> = z.object({
    cpuSeconds: z.number().default(30),
    addressSpaceBytes: z.number().default(2_147_483_648),
    maxWallMs: z.number().default(600_000),
    maxLogBytes: z.number().default(1_048_576),
    maxValueBytes: z.number().default(67_108_864),
    pythonPath: z.string().default('python3'),
  })

  readonly language = 'python'

  get isolation(): string {
    return process.platform === 'win32' ? 'process' : 'process-rlimit'
  }

  private readonly config: ResolvedConfig
  private readonly live = new Set<LiveRun>()
  private disposed = false

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = config as ResolvedConfig

    if (!Number.isFinite(this.config.cpuSeconds) || this.config.cpuSeconds <= 0) {
      throw new Error('dsh-code-runtime-data-python: config.cpuSeconds must be a positive number')
    }
    if (!Number.isFinite(this.config.addressSpaceBytes) || this.config.addressSpaceBytes <= 0) {
      throw new Error('dsh-code-runtime-data-python: config.addressSpaceBytes must be a positive number')
    }
    if (!Number.isFinite(this.config.maxWallMs) || this.config.maxWallMs <= 0) {
      throw new Error('dsh-code-runtime-data-python: config.maxWallMs must be a positive number')
    }
    if (this.config.maxWallMs > MAX_TIMER_DELAY_MS) {
      throw new Error(`dsh-code-runtime-data-python: config.maxWallMs must be at most ${MAX_TIMER_DELAY_MS}`)
    }
    if (!Number.isSafeInteger(this.config.maxLogBytes) || this.config.maxLogBytes < 4) {
      throw new Error('dsh-code-runtime-data-python: config.maxLogBytes must be a safe integer of at least 4')
    }
    if (!Number.isSafeInteger(this.config.maxValueBytes) || this.config.maxValueBytes < 4) {
      throw new Error('dsh-code-runtime-data-python: config.maxValueBytes must be a safe integer of at least 4')
    }

    ctx.effect(() => () => this.teardown(), 'python code-runtime teardown')
  }

  private async teardown(): Promise<void> {
    this.disposed = true
    const runs = [...this.live]
    for (const run of runs) run.settle({ kind: 'abort', message: 'runtime disposed' })
    await Promise.all(runs.map(run => run.finished))
  }

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    if (this.disposed) throw new Error('dsh-code-runtime-data-python: run() after disposal')
    const bindings = this.validateBindings(request)
    if (request.signal?.aborted) {
      return { logs: [], error: { kind: 'abort', message: String(request.signal.reason) } }
    }
    return await this.execute(request, bindings)
  }

  private validateBindings(request: CodeRunRequest): Map<string, CodeBindingNamespace> {
    const bindings = new Map<string, CodeBindingNamespace>()
    for (const namespace of request.bindings) {
      if (!IDENTIFIER.test(namespace.global) || PORTABLE_RESERVED_WORDS.has(namespace.global)) {
        throw new Error(`dsh-code-runtime-data-python: binding global ${JSON.stringify(namespace.global)} is not a usable identifier`)
      }
      if (RESERVED_BINDING_GLOBALS.has(namespace.global)) {
        throw new Error(`dsh-code-runtime-data-python: reserved binding global ${JSON.stringify(namespace.global)}`)
      }
      if (bindings.has(namespace.global)) {
        throw new Error(`dsh-code-runtime-data-python: duplicate binding global ${JSON.stringify(namespace.global)}`)
      }
      bindings.set(namespace.global, namespace)
    }

    const errorClassNames = new Set<string>()
    for (const namespace of request.bindings) {
      const descriptor = namespace.errorClass
      if (!descriptor) continue
      if (!IDENTIFIER.test(descriptor.name) || PORTABLE_RESERVED_WORDS.has(descriptor.name)) {
        throw new Error(`dsh-code-runtime-data-python: binding error class ${JSON.stringify(descriptor.name)} is not a usable identifier`)
      }
      if (RESERVED_BINDING_GLOBALS.has(descriptor.name)) {
        throw new Error(`dsh-code-runtime-data-python: reserved binding global ${JSON.stringify(descriptor.name)}`)
      }
      if (bindings.has(descriptor.name) || errorClassNames.has(descriptor.name)) {
        throw new Error(`dsh-code-runtime-data-python: duplicate injected global ${JSON.stringify(descriptor.name)}`)
      }
      const member = descriptor.memberNameProperty
      if (member.length === 0 || RESERVED_ERROR_MEMBERS.has(member) || DUNDER_MEMBER.test(member)) {
        throw new Error(`dsh-code-runtime-data-python: binding error member property ${JSON.stringify(descriptor.memberNameProperty)} is not usable`)
      }
      errorClassNames.add(descriptor.name)
    }
    return bindings
  }

  private execute(
    request: CodeRunRequest,
    bindings: Map<string, CodeBindingNamespace>,
  ): Promise<CodeRunResult> {
    const bootMessage: BootMessage = {
      type: 'boot',
      cpuSeconds: this.config.cpuSeconds,
      addressSpaceBytes: this.config.addressSpaceBytes,
      maxLogBytes: this.config.maxLogBytes,
      maxValueBytes: this.config.maxValueBytes,
      namespaces: [...bindings].map(([global, namespace]) => ({
        global,
        names: Object.keys(namespace.functions),
        ...namespace.errorClass ? { errorClass: namespace.errorClass } : {},
      })),
    }

    const child = spawn(this.config.pythonPath, [BOOTSTRAP_PATH], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      env: {},
    })

    const fd3Write = child.stdio[3] as NodeJS.WritableStream
    const fd3Read = child.stdio[3] as NodeJS.ReadableStream

    return new Promise<CodeRunResult>((resolve) => {
      let settled = false
      const answered = new Set<number>()
      const logs: string[] = []
      const strayLogs: string[] = []
      let logBytesUsed = 2
      let logTruncated = false

      // Substrate-death signal: resolves once the child has exited AND its
      // stdio pipes have closed ('close' follows 'exit' and the pipe drain),
      // or on a spawn 'error'. Registered synchronously at child setup so a
      // death that already queued cannot be missed (defensive-patterns.md:
      // dispose must reach quiescence, not just request the kill).
      const childClosed = new Promise<void>((closeResolve) => {
        const onTerminal = (): void => { closeResolve() }
        child.once('close', onTerminal)
        child.once('error', onTerminal)
      })

      const finish = (result: CodeRunResult): void => {
        if (settled) return
        settled = true
        clearTimeout(wallTimer)
        request.signal?.removeEventListener('abort', onAbort)
        this.live.delete(live)
        child.kill('SIGKILL')
        // Await the child's actual death before resolving so teardown's
        // `await run.finished` reaches quiescence; the run promise no longer
        // settles while the substrate may still be dying.
        void childClosed.then(() => {
          finishResolve()
          resolve(result)
        })
      }

      let finishResolve!: () => void
      const finished = new Promise<void>((done) => { finishResolve = done })

      const sendFrame = (frame: ReplyMessage): void => {
        if (settled) return
        const line = encodeJsonPlain(frame) + '\n'
        fd3Write.write(line)
      }

      // Read fd-3 frames from the child, with an inbound frame-size cap before
      // JSON.parse runs (protocol.ts checkDoneValue JSDoc: the runtime that
      // reads the channel owns this cap). A line over maxFrameBytes is forged
      // junk and is dropped, never buffered whole or parsed.
      const maxFrameBytes = this.config.maxValueBytes + this.config.maxLogBytes + 4096
      let bootAcked = false

      createCappedLineReader(fd3Read, maxFrameBytes, (line: string) => {
        if (settled) return

        // Reject lines with beyond-safe-range integer tokens
        if (hasUnsafeIntegerToken(line)) return

        let raw: unknown
        try {
          raw = JSON.parse(line)
        } catch {
          return
        }

        const frame = validateChildFrame(raw)
        if (!frame) return

        if (frame.type === 'boot-ack') {
          if (bootAcked) return
          bootAcked = true
          // Send the run message
          const runLine = encodeJsonPlain({ type: 'run', program: request.program }) + '\n'
          fd3Write.write(runLine)
          return
        }

        if (frame.type === 'log') {
          if (logTruncated) return
          if (frame.truncated) {
            logTruncated = true
            logs.push(logTruncationMarker(this.config.maxLogBytes))
            return
          }
          // Host-side log metering (non-allocating via sibling helper)
          const separatorBytes = logs.length > 0 ? 1 : 0
          const textBytes = jsonStringBytesUpTo(frame.text, this.config.maxLogBytes - logBytesUsed - separatorBytes)
          if (textBytes === undefined) {
            logTruncated = true
            logs.push(logTruncationMarker(this.config.maxLogBytes))
            return
          }
          logBytesUsed += textBytes + separatorBytes
          logs.push(frame.text)
          return
        }

        if (frame.type === 'call') {
          if (answered.has(frame.id)) return
          answered.add(frame.id)

          const record = bindings.get(frame.global)?.functions
          const fn = record && Object.hasOwn(record, frame.name) ? record[frame.name] : undefined
          if (typeof fn !== 'function') {
            sendFrame({ type: 'reply', id: frame.id, ok: false, message: `unknown binding ${JSON.stringify(`${frame.global}.${frame.name}`)}` })
            return
          }
          if (hasNonLosslessNumber(frame.args)) {
            sendFrame({ type: 'reply', id: frame.id, ok: false, message: 'binding arguments must be lossless JSON' })
            return
          }
          void (async () => {
            try {
              const resolved = await fn(frame.args)
              let value: CodeJsonValue | undefined
              try {
                value = snapshotJsonValue(resolved)
              } catch {
                value = undefined
              }
              if (value === undefined) {
                sendFrame({ type: 'reply', id: frame.id, ok: false, message: 'binding resolution must be lossless JSON' })
              } else {
                sendFrame({ type: 'reply', id: frame.id, ok: true, value })
              }
            } catch (error: unknown) {
              sendFrame({ type: 'reply', id: frame.id, ok: false, message: messageOf(error) })
            }
          })()
          return
        }

        // frame is DoneMessage: validateChildFrame returns a closed union
        // (BootAckMessage | CallMessage | LogMessage | DoneMessage); the
        // boot-ack/log/call branches above return, so the type narrows here.
        if (frame.error) {
          finish({ logs: [...logs, ...strayLogs], error: { kind: frame.error.kind, message: frame.error.message } })
        } else if (frame.value !== undefined) {
          const check = checkDoneValue(frame.value, this.config.maxValueBytes)
          if (!check.ok) {
            if (check.reason === 'over-budget') {
              finish({ logs: [...logs, ...strayLogs], error: { kind: 'output-limit', message: `completion value exceeded ${this.config.maxValueBytes} bytes` } })
            } else {
              finish({ logs: [...logs, ...strayLogs], error: { kind: 'invalid-output', message: 'program completion must be lossless JSON' } })
            }
          } else {
            finish({ logs: [...logs, ...strayLogs], value: frame.value as CodeJsonValue })
          }
        } else {
          finish({ logs: [...logs, ...strayLogs] })
        }
        return
      })

      // Capture stray stdout/stderr from the child
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) return
        strayLogs.push(chunk.toString('utf8'))
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (settled) return
        strayLogs.push(chunk.toString('utf8'))
      })

      // Child exit without done
      child.on('exit', (code: number | null, signal: string | null) => {
        const msg = signal
          ? `python process killed by signal ${signal}`
          : `python process exited with code ${code ?? 1} before completing`
        finish({ logs: [...logs, ...strayLogs], error: { kind: 'worker-exit', message: msg } })
      })

      child.on('error', (error: Error) => {
        finish({ logs: [...logs, ...strayLogs], error: { kind: 'worker-exit', message: `spawn error: ${error.message}` } })
      })

      // Wall-clock timeout
      const wallTimer = setTimeout(() => {
        finish({ logs: [...logs, ...strayLogs], error: { kind: 'timeout', message: `wall-clock ceiling reached (${this.config.maxWallMs}ms)` } })
      }, this.config.maxWallMs)

      // Abort signal
      const onAbort = (): void => {
        finish({ logs: [...logs, ...strayLogs], error: { kind: 'abort', message: String(request.signal?.reason) } })
      }
      request.signal?.addEventListener('abort', onAbort, { once: true })

      const live: LiveRun = {
        child,
        finished,
        settle: (failure: CodeRunFailure) => { finish({ logs: [...logs, ...strayLogs], error: failure }) },
      }
      this.live.add(live)

      // Send the boot message
      const bootLine = encodeJsonPlain(bootMessage) + '\n'
      fd3Write.write(bootLine)
    })
  }
}

export default DataPythonCodeRuntime
