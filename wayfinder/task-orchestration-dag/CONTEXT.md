# Task DAG execution

This context names execution choices and their relationship to the Task Graph. Decision details live in the owning wayfinder tickets.

## Language

**Execution target（执行目标）**:
A deployment-provided, named execution choice selected in a Task, independent of the native executor's implementation names. It identifies the intended way to perform the Task without granting execution authority.
_Avoid_: capability request, preset, execution attempt

**Executor adapter（执行器适配器）**:
The integration that maps Task Graph execution requests and native executor observations without owning the executor's internal lifecycle.
_Avoid_: scheduler, Task instance

**Execution target revision（执行目标修订）**:
An immutable version of an execution target's declared behavior, inputs, and outputs. It is distinct from a package release or credential rotation.
_Avoid_: package version, live configuration
