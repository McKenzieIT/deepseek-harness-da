import { expect, test } from 'vitest'
import { classifyDaOwned } from './da-owned-packages'

test('DA 自有 = 本地包目录中 upstream 不含的那些', () => {
  const local = ['packages/data/nl2sql-engine', 'packages/core/dsh-core', 'packages/eval/eval-cli']
  const upstream = new Set(['packages/core/dsh-core'])
  expect(classifyDaOwned(local, upstream)).toEqual([
    'packages/data/nl2sql-engine',
    'packages/eval/eval-cli',
  ])
})

test('upstream 为空集时,全部本地包都是 DA 自有', () => {
  const local = ['packages/a', 'packages/b']
  expect(classifyDaOwned(local, new Set())).toEqual(['packages/a', 'packages/b'])
})

test('本地包全部存在于 upstream 时,DA 自有为空', () => {
  const local = ['packages/core/dsh-core']
  expect(classifyDaOwned(local, new Set(['packages/core/dsh-core']))).toEqual([])
})
