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
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { CodeRuntime, DUNDER_MEMBER, PORTABLE_RESERVED_WORDS, RESERVED_BINDING_GLOBALS, RESERVED_ERROR_MEMBERS } from '@deepseek-ai/dsh-code-runtime'
import type { CodeBindingNamespace, CodeJsonValue, CodeRunFailure, CodeRunRequest, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
import { checkDoneValue, encodeJsonPlain, hasNonLosslessNumber, hasUnsafeIntegerToken, logTruncationMarker, validateChildFrame } from '@deepseek-ai/dsh-code-runtime-python'
import type { BootMessage, ReplyMessage } from '@deepseek-ai/dsh-code-runtime-python'
import { snapshotJsonValue } from '@deepseek-ai/dsh-session'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const BOOTSTRAP_PATH = fileURLToPath(new URL('../py/bootstrap.py', import.meta.url))

export interface Config {
  cpuSeconds?: number
  addressSpaceBytes?: number
  maxWallMs?: number
  maxLogBytes?: number
  maxValueBytes?: number
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

      const finish = (result: CodeRunResult): void => {
        if (settled) return
        settled = true
        clearTimeout(wallTimer)
        request.signal?.removeEventListener('abort', onAbort)
        this.live.delete(live)
        child.kill('SIGKILL')
        finishResolve()
        resolve(result)
      }

      let finishResolve!: () => void
      const finished = new Promise<void>((done) => { finishResolve = done })

      const sendFrame = (frame: ReplyMessage): void => {
        if (settled) return
        const line = encodeJsonPlain(frame as unknown as Record<string, unknown>) + '\n'
        fd3Write.write(line)
      }

      // Read fd-3 frames from the child
      const rl = createInterface({ input: fd3Read })
      let bootAcked = false

      rl.on('line', (line: string) => {
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
          const runLine = encodeJsonPlain({ type: 'run', program: request.program } as unknown as Record<string, unknown>) + '\n'
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
          // Host-side log metering
          const textJson = JSON.stringify(frame.text)
          const textBytes = Buffer.byteLength(textJson, 'utf8')
          const separatorBytes = logs.length > 0 ? 1 : 0
          if (logBytesUsed + textBytes + separatorBytes > this.config.maxLogBytes) {
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

        if (frame.type === 'done') {
          if (frame.error) {
            finish({ logs: [...logs, ...strayLogs], error: { kind: frame.error.kind as CodeRunFailure['kind'], message: frame.error.message } })
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
        }
      })

      // Capture stray stdout/stderr from the child
      child.stdout?.on('data', (chunk: Buffer) => {
        if (settled) return
        strayLogs.push(chunk.toString('utf8'))
      })
      child.stderr?.on('data', (chunk: Buffer) => {
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
      const bootLine = encodeJsonPlain(bootMessage as unknown as Record<string, unknown>) + '\n'
      fd3Write.write(bootLine)
    })
  }
}

export default DataPythonCodeRuntime
