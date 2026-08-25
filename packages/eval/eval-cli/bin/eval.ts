#!/usr/bin/env node --import tsx/esm
import { main } from '../src/main.ts'

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
