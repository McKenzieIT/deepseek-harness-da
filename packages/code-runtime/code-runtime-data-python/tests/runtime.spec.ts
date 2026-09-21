import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DataPythonCodeRuntime } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import type { PtcBindingFunction, PtcBindingNamespace, PtcRunRequest, PtcRunResult } from '@deepseek-ai/dsh-ptc-runtime'

async function setup(config: Config = {}) {
  const ciPythonPath = config.pythonPath === undefined ? process.env.DSH_TEST_PYTHON_PATH : undefined
  const ctx = new Context()
  await ctx.plugin(DataPythonCodeRuntime, {
    ...(ciPythonPath === undefined ? {} : { pythonPath: ciPythonPath }),
    ...config,
  })
  const runtime = ctx.ptcRuntime as DataPythonCodeRuntime
  const run = (request: PtcRunRequest): Promise<PtcRunResult> => runtime.run(runtime.resolve(request))
  return { ctx, runtime, run }
}

function tools(functions: Record<string, (args: unknown) => Promise<unknown>>): PtcBindingNamespace[] {
  return [{
    global: 'tools',
    functions: functions as Record<string, PtcBindingFunction>,
    errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' },
  }]
}

// The real host platform, captured before any test can patch it.
const hostPlatform = process.platform
// The full original descriptor ({ writable: false, enumerable: true,
// configurable: true }); restoring it verbatim puts every attribute back, not
// just the value.
const hostPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!

/**
 * The exact containment label the runtime must advertise for a platform. This
 * restates the contract independently of src/index.ts on purpose: the two
 * literals below are cross-pinned by
 * 'reports the exact isolation label for each platform', which hard-codes them
 * per arm, so this mapping cannot silently drift into agreeing with a broken
 * implementation.
 * @param platform - a `process.platform` value.
 * @returns the only isolation string that is correct on that platform.
 */
function expectedIsolationFor(platform: string): string {
  // Windows has no setrlimit, so the label may not claim rlimit containment.
  return platform === 'win32' ? 'process' : 'process-rlimit'
}

/** Put the real `process.platform` descriptor back, attributes included. */
function restoreHostPlatform(): void {
  Object.defineProperty(process, 'platform', hostPlatformDescriptor)
}

/**
 * Read `runtime.isolation` as if the host were `platform`.
 *
 * The patch window is strictly synchronous — nothing is awaited while
 * `process.platform` is a lie — so no sibling test or pending subprocess
 * callback can observe the fake value, and try/finally restores it even if the
 * getter throws.
 * @param runtime - a mounted runtime (no CPython process is involved).
 * @param platform - the platform to impersonate for one property read.
 * @returns the label the getter produces under that platform.
 */
function isolationUnderPlatform(runtime: DataPythonCodeRuntime, platform: string): string {
  Object.defineProperty(process, 'platform', { ...hostPlatformDescriptor, value: platform })
  try {
    return runtime.isolation
  } finally {
    restoreHostPlatform()
  }
}

describe('DataPythonCodeRuntime — seam registration', () => {
  // Belt and braces over isolationUnderPlatform's own try/finally: an
  // assertion that throws mid-test still cannot leak a fake platform into the
  // CPython suites below, whose POSIX guards would otherwise silently skip.
  afterEach(restoreHostPlatform)

  it('registers with language=python', async () => {
    const { runtime } = await setup()
    expect(runtime.language).toBe('python')
    // Exact, not /^process/: the old regex accepted both arms (and any
    // 'process*' typo), which is why only the host's own arm was ever covered.
    // Deriving the expectation from the host keeps this green on every lane.
    expect(runtime.isolation).toBe(expectedIsolationFor(hostPlatform))
  })

  it('reports the exact isolation label for each platform', async () => {
    // Both arms of the platform ternary must execute in ONE run on ANY host:
    // a Linux lane never reaches the win32 arm and a Windows lane never
    // reaches the rlimit arm, so neither lane can pin that line by itself.
    // A deliberately non-existent interpreter proves the label is pure
    // metadata — mounting the plugin and reading `isolation` never spawns
    // CPython, so this test needs no python3/pandas on the host.
    const { runtime } = await setup({ pythonPath: '/nonexistent/python-never-spawned' })

    expect(isolationUnderPlatform(runtime, 'win32')).toBe('process')
    // Every POSIX host gets the bootstrap's RLIMIT_CPU/RLIMIT_AS.
    expect(isolationUnderPlatform(runtime, 'linux')).toBe('process-rlimit')
    expect(isolationUnderPlatform(runtime, 'darwin')).toBe('process-rlimit')
    expect(isolationUnderPlatform(runtime, 'freebsd')).toBe('process-rlimit')

    // No residue: the host platform is back, and the assertion the
    // registration test above makes still holds in this same process.
    expect(process.platform).toBe(hostPlatform)
    expect(Object.getOwnPropertyDescriptor(process, 'platform')).toEqual(hostPlatformDescriptor)
    expect(runtime.isolation).toBe(expectedIsolationFor(process.platform))
  })
})

describe('DataPythonCodeRuntime — programs and values', () => {
  it('runs simple Python and returns a value', async () => {
    const { run } = await setup()
    const result = await run({
      program: 'return 1 + 2',
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toBe(3)
  })

  it('captures print output as logs', async () => {
    const { run } = await setup()
    const result = await run({
      program: `
print("hello")
print("world")
return 42
`,
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toBe(42)
    expect(result.logs).toEqual(['hello', 'world'])
  })

  it('returns None (undefined) when no explicit return', async () => {
    const { run } = await setup()
    const result = await run({
      program: 'x = 1 + 1',
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
    expect(result.logs).toEqual([])
  })

  it('returns complex JSON values', async () => {
    const { run } = await setup()
    const result = await run({
      program: 'return {"nums": [1, 2, 3], "nested": {"a": True, "b": None}}',
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({ nums: [1, 2, 3], nested: { a: true, b: null } })
  })

  it('reports SyntaxError as exception', async () => {
    const { run } = await setup()
    const result = await run({
      program: 'def foo(\n',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('exception')
    expect(result.error!.message).toContain('SyntaxError')
  })

  it('reports runtime exception with traceback', async () => {
    const { run } = await setup()
    const result = await run({
      program: 'return 1 / 0',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('exception')
    expect(result.error!.message).toContain('ZeroDivisionError')
  })

  it('rejects non-JSON return values', async () => {
    const { run } = await setup()
    const result = await run({
      program: 'return object()',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('invalid-output')
  })
})

describe('DataPythonCodeRuntime — pandas compute', () => {
  it('executes DataFrame operations and returns results', async () => {
    const { run } = await setup()
    const result = await run({
      program: `
import pandas as pd
df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})
return {"sum_a": int(df["a"].sum()), "mean_b": float(df["b"].mean())}
`,
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({ sum_a: 6, mean_b: 5.0 })
  })

  it('uses numpy for computation', async () => {
    const { run } = await setup()
    const result = await run({
      program: `
import numpy as np
arr = np.array([1, 2, 3, 4, 5])
return {"mean": float(arr.mean()), "std": round(float(arr.std()), 4)}
`,
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value!).toHaveProperty('mean', 3.0)
  })
})

describe('DataPythonCodeRuntime — bindings', () => {
  it('calls host bindings from Python', async () => {
    const calls: unknown[] = []
    const { run } = await setup()
    const result = await run({
      program: `
result = await tools.echo({"msg": "hello"})
return result
`,
      bindings: tools({
        echo: async (args) => { calls.push(args); return { echoed: args } },
      }),
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({ echoed: { msg: 'hello' } })
    expect(calls).toEqual([{ msg: 'hello' }])
  })

  it('propagates host binding rejection as program exception', async () => {
    const { run } = await setup()
    const result = await run({
      program: `
try:
    await tools.fail(None)
    return "should not reach"
except Exception as e:
    return {"caught": str(e)}
`,
      bindings: tools({
        fail: async () => { throw new Error('nope') },
      }),
    })
    expect(result.error).toBeUndefined()
    expect((result.value as Record<string, unknown>).caught).toContain('nope')
  })

  it('passes None args correctly', async () => {
    const calls: unknown[] = []
    const { run } = await setup()
    const result = await run({
      program: `
result = await tools.get_data(None)
return result
`,
      bindings: tools({
        get_data: async (args) => { calls.push(args); return { rows: [[1, 2], [3, 4]] } },
      }),
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({ rows: [[1, 2], [3, 4]] })
    expect(calls).toEqual([null])
  })
})

describe('DataPythonCodeRuntime — resource limits', () => {
  it('wall-clock timeout terminates hung programs', async () => {
    const { run } = await setup({ maxWallMs: 2000 })
    const result = await run({
      program: `
import time
time.sleep(30)
return "should not reach"
`,
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('timeout')
    expect(result.error!.message).toContain('wall-clock')
  }, 10_000)

  it('RLIMIT_CPU terminates runaway loops on POSIX', async () => {
    if (process.platform === 'win32') return
    const { run } = await setup({ cpuSeconds: 1, maxWallMs: 10_000 })
    const start = Date.now()
    const result = await run({
      program: `
while True:
    pass
`,
      bindings: [],
    })
    const elapsed = Date.now() - start
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('worker-exit')
    expect(elapsed).toBeLessThan(8000)
  }, 15_000)

  it('RLIMIT_AS terminates memory-hungry code on Linux', async () => {
    // RLIMIT_AS is only enforced on Linux; macOS ignores it at the kernel level
    if (process.platform !== 'linux') return
    const { run } = await setup({ addressSpaceBytes: 512_000_000, maxWallMs: 15_000 })
    const result = await run({
      program: `
try:
    data = bytearray(600_000_000)
    return len(data)
except MemoryError as e:
    raise MemoryError("hit RLIMIT_AS") from e
`,
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toMatch(/worker-exit|exception/)
  }, 20_000)

  it('output budget enforced (maxLogBytes)', async () => {
    const { run } = await setup({ maxLogBytes: 100 })
    const result = await run({
      program: `
for i in range(1000):
    print(f"line {i}: " + "x" * 100)
return "done"
`,
      bindings: [],
    })
    expect(result.logs.length).toBeGreaterThan(0)
    const lastLog = result.logs[result.logs.length - 1]
    expect(lastLog).toContain('truncated')
  })

  it('maxValueBytes rejects oversized completion', async () => {
    const { run } = await setup({ maxValueBytes: 50 })
    const result = await run({
      program: 'return "x" * 1000',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('output-limit')
  })
})

describe('DataPythonCodeRuntime — abort', () => {
  it('aborts on signal', async () => {
    const { run } = await setup()
    const controller = new AbortController()
    setTimeout(() =>{  controller.abort('user cancelled') }, 500)
    const result = await run({
      program: `
import time
time.sleep(30)
return "nope"
`,
      bindings: [],
      signal: controller.signal,
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('abort')
  }, 5000)

  it('returns abort immediately when signal already aborted', async () => {
    const { run } = await setup()
    const controller = new AbortController()
    controller.abort('already')
    const result = await run({
      program: 'return 1',
      bindings: [],
      signal: controller.signal,
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('abort')
  })
})

describe('DataPythonCodeRuntime — validation', () => {
  it('rejects reserved binding globals', async () => {
    const { run } = await setup()
    await expect(run({
      program: 'return 1',
      bindings: [{ global: 'console', functions: {} }],
    })).rejects.toThrow('reserved binding global')
  })

  it('rejects duplicate binding globals', async () => {
    const { run } = await setup()
    await expect(run({
      program: 'return 1',
      bindings: [
        { global: 'tools', functions: {} },
        { global: 'tools', functions: {} },
      ],
    })).rejects.toThrow('duplicate binding global')
  })

  it('disposal aborts in-flight runs and rejects later runs', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(DataPythonCodeRuntime, {})
    const runtime = ctx.ptcRuntime as DataPythonCodeRuntime
    const run = (request: PtcRunRequest): Promise<PtcRunResult> => runtime.run(runtime.resolve(request))
    const inflight = run({ program: `
import time
time.sleep(30)
return "nope"
`, bindings: [] })
    await new Promise(r => setTimeout(r, 500))
    await fiber.dispose()
    const result = await inflight
    expect(result.error).toEqual({ kind: 'abort', message: 'runtime disposed' })
    await expect(run({ program: 'return 1', bindings: [] })).rejects.toThrow(/after disposal/)
  }, 10_000)
})
