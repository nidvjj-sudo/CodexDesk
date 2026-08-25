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

const installerScript = readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8')
if (!installerScript.includes('${ifNot} ${isUpdated}')) throw new Error('Update-safe uninstall guard is missing')

const mainSource = readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8')
if (!mainSource.includes("['--updated', '--force-run']") || mainSource.includes("['--updated', '/S'")) {
  throw new Error('The updater must launch the visible installer in update mode')
}

const rendererEntry = readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8')
if (rendererEntry.includes('monaco-editor') || rendererEntry.includes('MonacoEnvironment')) {
  throw new Error('Monaco must remain lazy-loaded outside the renderer entry')
}

const appSource = readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')
if (appSource.includes('setInterval(() => void refreshWeeklyUsage')) {
  throw new Error('Weekly usage polling must not run continuously')
}
if (!mainSource.includes("ipcMain.handle('codex:plan'") || !mainSource.includes("ipcMain.handle('history:update-event'")) {
  throw new Error('Plan generation or persisted plan tracking is missing')
}
if (!appSource.includes("['plan', 'plan_update', 'planUpdate', 'todo_list', 'todoList']")) {
  throw new Error('Codex plan update events are not handled')
}
if (!appSource.includes("artifactView === 'plan'") || !mainSource.includes("ipcMain.handle('undo:stats'")) {
  throw new Error('Plan panel or real file change statistics are missing')
}
if (!appSource.includes('startArtifactResize') || !appSource.includes("'--artifact-width'")) {
  throw new Error('Resizable artifact panel is missing')
}
if (!appSource.includes('ActivityLogItem') || !appSource.includes('activityCommandTitle') || !appSource.includes('startedAt')) {
  throw new Error('Detailed activity timeline is missing')
}
if (!appSource.includes('MarkdownCopyBox') || !appSource.includes("type: ['text', 'txt', 'plaintext', 'markdown', 'md'].includes(language) ? 'text' : 'code'")) {
  throw new Error('Copyable code and text boxes are missing')
}
if (!appSource.includes('removeQueuedTask') || !appSource.includes('moveQueuedTask')) {
  throw new Error('Queue management controls are missing')
}
if (!mainSource.includes('remove every temporary artifact before finishing') || !mainSource.includes('Prefer editing existing project files in place')) {
  throw new Error('Temporary artifact cleanup policy is missing')
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
