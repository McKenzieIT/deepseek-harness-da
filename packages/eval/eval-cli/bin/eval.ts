#!/usr/bin/env node --import tsx/esm
import { main } from '../src/main.ts'

main().then(() => {
  setTimeout(() => process.exit(0), 100)
}).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  setTimeout(() => process.exit(1), 100)
})
