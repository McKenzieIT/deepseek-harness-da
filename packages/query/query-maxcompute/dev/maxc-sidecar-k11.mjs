#!/usr/bin/env node
// Wrapper: maxc-sidecar with ieu_cdm config baked in for K11 eval runs.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

// Inject the --maxc-config arg before the real sidecar runs
const configPath = resolve(homedir(), '.maxc/config_ieu_cdm.yaml.bak')
process.argv.push('--maxc-config', configPath)

// Import the real sidecar
await import('./maxc-sidecar.mjs')
