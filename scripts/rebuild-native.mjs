// Fetch the better-sqlite3 prebuilt binary matching a runtime ABI.
//   node scripts/rebuild-native.mjs electron   -> for running/packaging the app (default)
//   node scripts/rebuild-native.mjs node        -> for running vitest under system Node
//
// better-sqlite3 has one native binary slot, and Electron and Node use different
// ABIs. So tests (Node) and the app (Electron) each need their own fetch; the
// pre-scripts in package.json swap it automatically. Avoids needing a C++ toolchain.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const target = process.argv[2] === 'node' ? 'node' : 'electron'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bsqDir = join(root, 'node_modules/better-sqlite3')
const prebuild = join(root, 'node_modules/prebuild-install/bin.js')

if (!existsSync(prebuild) || !existsSync(bsqDir)) {
  console.log('[rebuild-native] better-sqlite3/prebuild-install not present, skipping')
  process.exit(0)
}

const args = ['--arch', process.arch]
if (target === 'electron') {
  const electronPkg = join(root, 'node_modules/electron/package.json')
  if (!existsSync(electronPkg)) {
    console.log('[rebuild-native] electron not present, skipping')
    process.exit(0)
  }
  const version = JSON.parse(readFileSync(electronPkg, 'utf8')).version
  args.unshift('-r', 'electron', '-t', version)
}

try {
  execFileSync(process.execPath, [prebuild, ...args], { cwd: bsqDir, stdio: 'inherit' })
  console.log(`[rebuild-native] better-sqlite3 binary ready for ${target}`)
} catch (e) {
  console.error('[rebuild-native] failed:', e.message)
  process.exit(0)
}
