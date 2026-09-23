/**
 * DA 自有包归属:列出本地 workspace 中 `upstream/master` 不含的包目录。
 *
 * 归属判据取自 UM18 全程使用的权威 —— merge-base(上游最新 tag)上不存在的包即 fork
 * 自有。个别对上游文件的加性修改由 docs/da-upstream-debt.md 登记、由
 * scripts/run-oxlint.ts 的 STRICT_OVERRIDE blob-pin 兜底,不在本脚本范围内(本脚本按
 * 「整个包目录是否存在于上游」判定,不做文件级 diff)。
 *
 * 用途:ci-da.yml 的 `da-checks` 作业据此把 test 只跑在 DA 自有包上,使 fork 的合并
 * 判据免疫上游基础设施债(bubblewrap 404 / 缺 secret / 16 核预算 / 上游自碎测试)。
 * 见 wayfinder/repo-infra/tickets/T29-da-ci-upstream-boundary.md。
 *
 * 用法:`pnpm exec tsx scripts/da-owned-packages.ts`(每行一个 DA 自有包目录)。
 */
import { execFileSync } from 'node:child_process'

/** DA 自有 = 本地包目录里 upstream 不含的那些(纯函数,便于单测)。 */
export function classifyDaOwned(localPkgDirs: readonly string[], upstreamPkgDirs: ReadonlySet<string>): string[] {
  return localPkgDirs.filter(dir => !upstreamPkgDirs.has(dir))
}

/** upstream ref 里含有 package.json 的目录集合。 */
export function upstreamPackageDirs(ref = 'upstream/master'): Set<string> {
  const out = execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { encoding: 'utf8' })
  return new Set(
    out
      .split('\n')
      .filter(file => file.endsWith('/package.json'))
      .map(file => file.slice(0, -'/package.json'.length)),
  )
}

/** 本地所有 workspace 包目录(镜像 rescope-fork 的发现 glob,不含仓库根 package.json)。 */
export function localPackageDirs(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', 'packages/**/package.json', 'apps/*/package.json', 'native/**/package.json'],
    { encoding: 'utf8' },
  )
  return out
    .split('\n')
    .filter(Boolean)
    .map(file => file.slice(0, -'/package.json'.length))
}

/** CLI:打印 DA 自有包目录,每行一个(供 ci-da.yml 的 mapfile 消费)。 */
if (process.argv[1] !== undefined && process.argv[1].endsWith('da-owned-packages.ts')) {
  const daOwned = classifyDaOwned(localPackageDirs(), upstreamPackageDirs())
  process.stdout.write(daOwned.length > 0 ? `${daOwned.join('\n')}\n` : '')
}
