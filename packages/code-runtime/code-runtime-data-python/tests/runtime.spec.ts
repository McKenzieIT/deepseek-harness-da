import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DataPythonCodeRuntime } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import type { CodeBindingFunction, CodeBindingNamespace } from '@deepseek-ai/dsh-code-runtime'

async function setup(config: Config = {}) {
  const ctx = new Context()
  await ctx.plugin(DataPythonCodeRuntime, config)
  const runtime = ctx.codeRuntime as DataPythonCodeRuntime
  return { ctx, runtime }
}

function tools(functions: Record<string, (args: unknown) => Promise<unknown>>): CodeBindingNamespace[] {
  return [{
    global: 'tools',
    functions: functions as Record<string, CodeBindingFunction>,
    errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' },
  }]
}

describe('DataPythonCodeRuntime — seam registration', () => {
  it('registers with language=python', async () => {
    const { runtime } = await setup()
    expect(runtime.language).toBe('python')
    expect(runtime.isolation).toMatch(/^process/)
  })
})

describe('DataPythonCodeRuntime — programs and values', () => {
  it('runs simple Python and returns a value', async () => {
    const { runtime } = await setup()
    const result = await runtime.run({
      program: 'return 1 + 2',
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toBe(3)
  })

  it('captures print output as logs', async () => {
    const { runtime } = await setup()
    const result = await runtime.run({
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
    const { runtime } = await setup()
    const result = await runtime.run({
      program: 'x = 1 + 1',
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toBeUndefined()
    expect(result.logs).toEqual([])
  })

  it('returns complex JSON values', async () => {
    const { runtime } = await setup()
    const result = await runtime.run({
      program: 'return {"nums": [1, 2, 3], "nested": {"a": True, "b": None}}',
      bindings: [],
    })
    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({ nums: [1, 2, 3], nested: { a: true, b: null } })
  })

  it('reports SyntaxError as exception', async () => {
    const { runtime } = await setup()
    const result = await runtime.run({
      program: 'def foo(\n',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('exception')
    expect(result.error!.message).toContain('SyntaxError')
  })

  it('reports runtime exception with traceback', async () => {
    const { runtime } = await setup()
    const result = await runtime.run({
      program: 'return 1 / 0',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('exception')
    expect(result.error!.message).toContain('ZeroDivisionError')
  })

  it('rejects non-JSON return values', async () => {
    const { runtime } = await setup()
    const result = await runtime.run({
      program: 'return object()',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('invalid-output')
  })
})

describe('DataPythonCodeRuntime — pandas compute', () => {
  it('executes DataFrame operations and returns results', async () => {
    const { runtime } = await setup()
    const result = await runtime.run({
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
    const { runtime } = await setup()
    const result = await runtime.run({
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
    const { runtime } = await setup()
    const result = await runtime.run({
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
    const { runtime } = await setup()
    const result = await runtime.run({
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
    const { runtime } = await setup()
    const result = await runtime.run({
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
    const { runtime } = await setup({ maxWallMs: 2000 })
    const result = await runtime.run({
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
    const { runtime } = await setup({ cpuSeconds: 1, maxWallMs: 10_000 })
    const start = Date.now()
    const result = await runtime.run({
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
    const { runtime } = await setup({ addressSpaceBytes: 512_000_000, maxWallMs: 15_000 })
    const result = await runtime.run({
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
    const { runtime } = await setup({ maxLogBytes: 100 })
    const result = await runtime.run({
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
    const { runtime } = await setup({ maxValueBytes: 50 })
    const result = await runtime.run({
      program: 'return "x" * 1000',
      bindings: [],
    })
    expect(result.error).toBeDefined()
    expect(result.error!.kind).toBe('output-limit')
  })
})

describe('DataPythonCodeRuntime — abort', () => {
  it('aborts on signal', async () => {
    const { runtime } = await setup()
    const controller = new AbortController()
    setTimeout(() =>{  controller.abort('user cancelled') }, 500)
    const result = await runtime.run({
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
    const { runtime } = await setup()
    const controller = new AbortController()
    controller.abort('already')
    const result = await runtime.run({
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
    const { runtime } = await setup()
    await expect(runtime.run({
      program: 'return 1',
      bindings: [{ global: 'console', functions: {} }],
    })).rejects.toThrow('reserved binding global')
  })

  it('rejects duplicate binding globals', async () => {
    const { runtime } = await setup()
    await expect(runtime.run({
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
    const runtime = ctx.codeRuntime as DataPythonCodeRuntime
    const inflight = runtime.run({ program: `
import time
time.sleep(30)
return "nope"
`, bindings: [] })
    await new Promise(r => setTimeout(r, 500))
    await fiber.dispose()
    const result = await inflight
    expect(result.error).toEqual({ kind: 'abort', message: 'runtime disposed' })
    await expect(runtime.run({ program: 'return 1', bindings: [] })).rejects.toThrow(/after disposal/)
  }, 10_000)
})
