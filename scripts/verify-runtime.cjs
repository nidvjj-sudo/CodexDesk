const { spawnSync } = require('child_process')
const { existsSync, readFileSync } = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const assets = [
  ['icon.ico'],
  ['installer-header.bmp', 150, 57],
  ['installer-sidebar.bmp', 164, 314],
  ['uninstaller-sidebar.bmp', 164, 314]
]

for (const [name, width, height] of assets) {
  const file = path.join(root, 'build', name)
  if (!existsSync(file)) throw new Error(`Build asset not found: ${name}`)
  if (width && height) {
    const data = readFileSync(file)
    if (data.readUInt32LE(18) !== width || Math.abs(data.readInt32LE(22)) !== height) throw new Error(`Invalid build asset size: ${name}`)
  }
}

if (process.platform !== 'win32') process.exit(0)

const candidates = [
  path.join(root, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
  path.join(root, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')
]
const executable = candidates.find(existsSync)

if (!executable) {
  console.error('Codex runtime not found')
  process.exit(1)
}

const result = spawnSync(executable, ['--version'], {
  windowsHide: true,
  shell: false,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 15000
})

if (result.error || result.status !== 0 || !result.stdout.trim()) {
  console.error(result.error?.message || result.stderr || 'Codex runtime verification failed')
  process.exit(1)
}

console.log(`Codex runtime verified: ${result.stdout.trim()}`)
