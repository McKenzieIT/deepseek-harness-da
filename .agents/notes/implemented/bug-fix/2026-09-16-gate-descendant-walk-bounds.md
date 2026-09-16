# Agent Note: Bound the gate runner's process-tree walk

Status: implemented

English | [中文](2026-09-16-gate-descendant-walk-bounds.zh.md)

## Problem

The gate runner enumerates a finished gate's descendant processes so it can terminate the tree on Windows. That walk assumed the process-table dump it reads is a tree. It is not: the operating system recycles pids, so a row can name a parent whose number was reused and now sits below its own child in the same snapshot, and `Get-CimInstance Win32_Process` reports such a row as readily as any other.

Two details turned that assumption into a crash. The walk's queue aliased the child array stored in its own parent index rather than copying it, so appending to the queue rewrote the snapshot the walk was still reading; when a cycle reached back to the root, the queue doubled on every iteration. The walk also appended children by spreading them into `push`, which passes one argument per element, so a wide queue exceeded the engine's argument limit. V8 reports that argument overflow as `Maximum call stack size exceeded`.

The result was a gate runner that failed a lane whose tests had all passed. A Windows coverage job reported failure with zero test failures in its log, dying instead in the cleanup callback that runs after a gate settles — and because the runner fails fast, the rest of the lane never ran.

## Decision

The walk records every pid it has queued and refuses to queue one twice, so it is bounded by the row count rather than by trusting the snapshot's shape. A cyclic dump now yields each pid once instead of growing without end. The queue starts as a copy, because the parent index holds the live child arrays the walk is still reading. Children are appended one at a time, which removes the argument-limit path entirely.

The function is now exported. It had no direct test coverage before, which is why a snapshot shape the walk could not survive went unnoticed.

## Alternatives considered

**Raise the stack size.** The failure is an argument-count overflow, not recursion depth, so a larger stack moves the threshold without removing either defect. A cyclic snapshot would still grow the queue until memory ran out.

**Catch the `RangeError` around the walk.** The gate would then pass while the process tree stayed unterminated, so a later gate inherits stray processes holding stdio handles. Swallowing the error hides exactly the condition the walk exists to handle.

**Skip descendant enumeration on Windows.** Termination rooted at an already-exited pid finds nothing, because Windows never reparents; dropping the enumeration would leak the whole subtree whenever the direct child exits first.

## Consequences

Terminating one gate tree now costs a set membership check per row. A snapshot containing a cycle produces a correct descendant list instead of an exception, and a lane's red-or-green verdict again matches its test results. Regression tests pin the shapes that used to throw: a cycle back to the root, a cycle excluding the root, a self-parenting row, and a fan-out wider than the engine's argument limit, plus a repeated walk proving the caller's rows are left untouched.
