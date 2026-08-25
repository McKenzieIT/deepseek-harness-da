/**
 * One-off: generate Typert artifacts for the schema-gateway package only.
 * The full `build:lib:host` is blocked by pre-existing type errors in other
 * packages (tool-execute-metric, llm-wiring-integration.spec); this script
 * runs the WorkspaceTypertGenerator directly on our package so the client
 * gets the TYPERT_REMOTE contribution that creates ctx.remote.schemaGateway.
 *
 * Run: node --import tsx scripts/gen-schema-gateway-typert.ts
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '../packages/typert/generator/src/workspace.ts'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const TARGET_PKG = '@deepseek-ai/dsh-schema-gateway'
const PKG_DIR = 'packages/data/schema-gateway'

const gen = new WorkspaceTypertGenerator(REPO_ROOT)
const artifacts = gen.generate([TARGET_PKG], ['host'])

if (artifacts.length === 0) {
  console.error('❌ no artifacts emitted — generator did not discover a Typert face in schema-gateway')
  process.exit(1)
}

const output = join(REPO_ROOT, PKG_DIR, 'lib')
mkdirSync(output, { recursive: true })
let emittedRemote = false
for (const artifact of artifacts) {
  writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
  if (artifact.remote !== undefined) {
    emittedRemote = true
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
  console.log(`✅ emitted typert.${artifact.face}.js${artifact.remote !== undefined ? ' + typert.remote-client.js' : ''}`)
}
if (!emittedRemote) {
  console.warn('⚠️  no remote-client artifact — host face has no @Remote methods?')
}
console.log(`done: ${artifacts.length} artifact(s) → ${output}`)
