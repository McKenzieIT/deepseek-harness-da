import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { PythonCodeRuntime } from '../src/index.ts'
import type { Config } from '../src/index.ts'

const MEMORY_STRESS_CPU_SECONDS = 600
const MEMORY_STRESS_WALL_MS = 80_000
const MEMORY_STRESS_TEST_TIMEOUT_MS = 90_000

async function setup(config: Config) {
  const ctx = new Context()
  const fiber = await ctx.plugin(PythonCodeRuntime, config)
  return { fiber, runtime: ctx.codeRuntime as PythonCodeRuntime }
}

describe('PythonCodeRuntime — wide-value memory bounds', () => {
  it('checks and encodes a wide completion value in O(depth), not O(width)', async () => {
    // A wide flat list serializes to ~2 bytes per element but the pre-fix walk
    // enqueued one traversal tuple per element (_check_done_value) and one stack
    // entry plus a separator marker per element (_encode_json_plain) — ~56 bytes
    // per element, ~28x the serialized size. A value the byte meter admits could
    // therefore OOM on the checker's or encoder's own bookkeeping, the inversion
    // the load gate exists to prevent (the gate reserves 12x, not 28x). Both now
    // walk with an O(depth) cursor that pulls one child at a time, so the only
    // width-proportional allocation is the output string the meter bounded.
    //
    // Config: maxValueBytes 20 MiB against 384 MiB (20*12 = 240 MiB < 320 MiB
    // budgetable, so it loads). `[0] * 6_000_000` is ~12 MB of JSON, under the
    // 20 MiB budget, so it must round-trip. Pre-fix the ~400 MB of per-element
    // frames plus the interpreter exceeded 384 MiB and returned MemoryError as an
    // exception. Linux-only RLIMIT_AS repro; on macOS the value round-trips
    // either way, but the fixture stays within the address space so it is honest.
    //
    // The uninstrumented heavy-test gate owns this case: V8 coverage of the host
    // path adds no evidence about Python's allocation and can make the 6M-element
    // wire parse exceed the coverage lane's deadline. The wall and case budgets
    // still bound the run; the independent CPU limit stays beyond the wall clock.
    const { fiber, runtime } = await setup({
      cpuSeconds: MEMORY_STRESS_CPU_SECONDS,
      maxValueBytes: 20 * 1024 * 1024,
      addressSpaceMb: 384,
      maxWallMs: MEMORY_STRESS_WALL_MS,
    })
    try {
      const result = await runtime.run({ program: 'return [0] * 6_000_000', bindings: [] })
      expect(result.error).toBeUndefined()
      expect(Array.isArray(result.value)).toBe(true)
      expect((result.value as number[]).length).toBe(6_000_000)
    } finally {
      await fiber.dispose()
    }
  }, MEMORY_STRESS_TEST_TIMEOUT_MS)

  it('validates wide binding arguments in O(depth), not O(width)', async () => {
    // The completion-value walks are budgeted; this one is not. `dispatch` runs
    // `_lossless_json_violation` on the arguments the MODEL built, and no
    // child-side byte budget bounds them first: the frame ceiling is the host's
    // and applies only after this validation returns. A per-member traversal
    // frame therefore turned a legitimate call into the program's own
    // MemoryError. Measured with tracemalloc on the two walk shapes over this
    // exact argument (JSON ~17 MB): the cursor peaks at 0.0 MiB of auxiliary
    // state, the pre-fix `stack.extend` at 459.1 MiB -- past the 384 MiB
    // configured below, so the discriminating failure is real. It is Linux-only:
    // Darwin skips RLIMIT_AS, so this case round-trips there either way.
    //
    // The binding echoes its argument's length back, so the assertion proves the
    // call actually round-tripped rather than merely avoiding a crash.
    const { fiber, runtime } = await setup({
      cpuSeconds: MEMORY_STRESS_CPU_SECONDS,
      addressSpaceMb: 384,
      maxWallMs: MEMORY_STRESS_WALL_MS,
    })
    try {
      const result = await runtime.run({
        program: 'return await tools.width([0] * 6_000_000)',
        bindings: [{
          global: 'tools',
          functions: { width: async (items: unknown) => (items as number[]).length },
        }],
      })
      expect(result.error).toBeUndefined()
      expect(result.value).toBe(6_000_000)
    } finally {
      await fiber.dispose()
    }
  }, MEMORY_STRESS_TEST_TIMEOUT_MS)
})
