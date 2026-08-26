import { describe, expect, it } from 'vitest'
import { checkResultMatch } from '../src/match_modes.ts'

const pass = { status: 'pass', detail: '' }
const fail = (detail: string) => ({ status: 'fail' as const, detail })

describe('match_modes · scalar_exact', () => {
  it('passes when the first row’s first value === expected.value', () => {
    expect(checkResultMatch({ value: 'gameA' }, [{ game: 'gameA' }], 'scalar_exact')).toEqual(pass)
  })
  it('fails on a mismatch', () => {
    expect(checkResultMatch({ value: 'gameA' }, [{ game: 'gameB' }], 'scalar_exact')).toEqual(fail('expected "gameA", got "gameB"'))
  })
  it('fails when no rows returned', () => {
    expect(checkResultMatch({ value: 'gameA' }, [], 'scalar_exact').status).toBe('fail')
  })
  it('fails when the first row has no columns', () => {
    expect(checkResultMatch({ value: 'gameA' }, [{}], 'scalar_exact').status).toBe('fail')
  })
  it('passes with direct-value format (no envelope)', () => {
    expect(checkResultMatch({ notvalue: 1 }, [{ a: 1 }], 'scalar_exact').status).toBe('pass')
  })
  it('fails when expected is empty', () => {
    expect(checkResultMatch({}, [{ a: 1 }], 'scalar_exact').status).toBe('fail')
  })
})

describe('match_modes · multi_scalar_exact', () => {
  it('passes per-field (object fields)', () => {
    expect(checkResultMatch({ fields: { game: 'gameA', amt: 1000 } }, [{ game: 'gameA', amt: 1000 }], 'multi_scalar_exact')).toEqual(pass)
  })
  it('passes per-field (single-element array fields)', () => {
    expect(checkResultMatch({ fields: [{ game: 'gameA' }] }, [{ game: 'gameA' }], 'multi_scalar_exact')).toEqual(pass)
  })
  it('fails on a per-field mismatch', () => {
    const r = checkResultMatch({ fields: { game: 'gameA', amt: 1000 } }, [{ game: 'gameA', amt: 999 }], 'multi_scalar_exact')
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('amt')
  })
  it('fails when a field is missing from the result', () => {
    const r = checkResultMatch({ fields: { game: 'gameA' } }, [{ other: 1 }], 'multi_scalar_exact')
    expect(r.detail).toContain('missing')
  })
  it('fails when no rows returned', () => {
    expect(checkResultMatch({ fields: { a: 1 } }, [], 'multi_scalar_exact').status).toBe('fail')
  })
  it('fails when the fields list is empty', () => {
    expect(checkResultMatch({ fields: [] }, [{ a: 1 }], 'multi_scalar_exact').status).toBe('fail')
  })
  it('fails when fields is not an object', () => {
    expect(checkResultMatch({ fields: 'x' }, [{ a: 1 }], 'multi_scalar_exact').status).toBe('fail')
  })
  it('fails when the envelope is malformed (missing fields)', () => {
    expect(checkResultMatch({ notfields: 1 }, [{ a: 1 }], 'multi_scalar_exact').status).toBe('fail')
  })
})

describe('match_modes · row_count_range', () => {
  it('passes when count is in [min, max]', () => {
    expect(checkResultMatch({ min: 3, max: 5 }, [{ a: 1 }, { a: 2 }, { a: 3 }], 'row_count_range')).toEqual(pass)
  })
  it('fails when count is out of range', () => {
    expect(checkResultMatch({ min: 3, max: 5 }, [{ a: 1 }], 'row_count_range').status).toBe('fail')
  })
  it('fails when the envelope is malformed (missing min/max)', () => {
    expect(checkResultMatch({ min: 3 }, [], 'row_count_range').status).toBe('fail')
  })
  it('fails when min/max are not numbers', () => {
    expect(checkResultMatch({ min: 'x', max: 'y' }, [{ a: 1 }], 'row_count_range').status).toBe('fail')
  })
})

describe('match_modes · set_equal', () => {
  const rows = [{ game: 'gameA' }, { game: 'gameB' }]
  it('passes on a set-equal result', () => {
    expect(checkResultMatch({ rows }, [{ game: 'gameB' }, { game: 'gameA' }], 'set_equal')).toEqual(pass)
  })
  it('fails when an expected row is missing', () => {
    expect(checkResultMatch({ rows }, [{ game: 'gameA' }], 'set_equal').status).toBe('fail')
  })
  it('fails when there is an extra row', () => {
    expect(checkResultMatch({ rows: [{ game: 'gameA' }] }, [{ game: 'gameA' }, { game: 'gameB' }], 'set_equal').status).toBe('fail')
  })
  it('fails when the sets are equal-size but differ in content (exercises the setsEqual loop body)', () => {
    expect(checkResultMatch({ rows: [{ a: 1 }, { b: 2 }] }, [{ a: 1 }, { c: 3 }], 'set_equal').status).toBe('fail')
  })
  it('fails when the envelope is malformed (missing rows)', () => {
    expect(checkResultMatch({ notrows: 1 }, [{ a: 1 }], 'set_equal').status).toBe('fail')
  })
  it('fails when rows is not an array', () => {
    expect(checkResultMatch({ rows: 'x' }, [{ a: 1 }], 'set_equal').status).toBe('fail')
  })
})

describe('match_modes · ordered_subset', () => {
  const rows = [{ g: 'A' }, { g: 'C' }]
  it('passes when the ordered subsequence is found', () => {
    expect(checkResultMatch({ rows }, [{ g: 'A' }, { g: 'B' }, { g: 'C' }, { g: 'D' }], 'ordered_subset')).toEqual(pass)
  })
  it('passes when expected rows is empty', () => {
    expect(checkResultMatch({ rows: [] }, [{ g: 'A' }], 'ordered_subset')).toEqual(pass)
  })
  it('fails when the subsequence is not found in order', () => {
    expect(checkResultMatch({ rows }, [{ g: 'C' }, { g: 'A' }], 'ordered_subset').status).toBe('fail')
  })
  it('still passes with extra actual rows after the full match (exercises the want===undefined branch)', () => {
    expect(checkResultMatch({ rows: [{ g: 'A' }] }, [{ g: 'A' }, { g: 'B' }, { g: 'C' }], 'ordered_subset')).toEqual(pass)
  })
  it('fails when the envelope is malformed (missing rows)', () => {
    expect(checkResultMatch({ notrows: 1 }, [{ a: 1 }], 'ordered_subset').status).toBe('fail')
  })
  it('fails when rows is not an array', () => {
    expect(checkResultMatch({ rows: 'x' }, [{ a: 1 }], 'ordered_subset').status).toBe('fail')
  })
})

describe('match_modes · unknown mode', () => {
  it('fails on an unknown match_mode', () => {
    const r = checkResultMatch({ value: 1 }, [{ a: 1 }], 'no_such_mode')
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('unknown match_mode')
  })
})
