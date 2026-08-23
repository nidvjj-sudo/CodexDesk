const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron')
const { spawn } = require('child_process')
const { createHash } = require('crypto')
const { existsSync, mkdirSync } = require('fs')
const fs = require('fs/promises')
const path = require('path')
const { autoUpdater } = require('electron-updater')

let mainWindow
let projectRoot
let codexProcess
let codexStopRequested = false
let authProcess
let updateState = { status: 'idle', version: null, percent: 0 }

const ignored = new Set(['.git', '.idea', '.vs', 'node_modules', 'bin', 'obj', 'dist', 'release', 'build', 'venv', '.venv', '__pycache__'])

function cleanProcessText(value) {
  return value
    .toString('utf8')
    .replace(/\u001B(?:\[[0-?]*[ -/]*[@-~]|[@-_])/g, '')
    .replace(/%1B(?:%5B|\[)[0-9;]*m/gi, '')
}

function explainCodexFailure(value) {
  const text = cleanProcessText(value).trim()
  if (/not logged in|login required|unauthorized|\b401\b/i.test(text)) return 'บัญชี ChatGPT หมดอายุ กรุณาเชื่อมต่อบัญชีใหม่'
  if (/unexpected argument|invalid value|Usage:/i.test(text)) return 'Codex runtime ไม่รองรับคำสั่งนี้ กรุณาอัปเดต CodexDesk'
  if (/models cache|base_instructions/i.test(text)) return 'ข้อมูลโมเดล Codex ไม่สมบูรณ์ กรุณาปิดแอปแล้วเปิดใหม่'
  if (/blocked by policy|rejected: blocked/i.test(text)) return 'Windows บล็อกคำสั่งของ Codex กรุณาเปิดโหมดแก้ไขไฟล์ได้แล้วลองใหม่'
  const detail = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/codex_core|Wall time:|^\d{4}-\d{2}-\d{2}T/.test(line)).at(-1)
  return detail ? `Codex ทำงานไม่สำเร็จ: ${detail.slice(0, 240)}` : 'Codex ทำงานไม่สำเร็จ กรุณาลองสั่งงานใหม่'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 940,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#080808',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#080808', symbolColor: '#d8d8d8', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!app.isPackaged) mainWindow.loadURL('http://127.0.0.1:5173')
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function publishUpdateState(next) {
  updateState = { ...updateState, ...next }
  mainWindow?.webContents.send('update:event', updateState)
}

function setupAutoUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking', percent: 0 }))
  autoUpdater.on('update-available', info => publishUpdateState({ status: 'available', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'current', version: app.getVersion(), percent: 0 }))
  autoUpdater.on('download-progress', info => publishUpdateState({ status: 'downloading', percent: Math.round(info.percent || 0) }))
  autoUpdater.on('update-downloaded', info => publishUpdateState({ status: 'downloaded', version: info.version, percent: 100 }))
  autoUpdater.on('error', () => publishUpdateState({ status: 'error', percent: 0 }))
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => publishUpdateState({ status: 'error' })), 5000)
}

function safePath(input) {
  if (!projectRoot) throw new Error('ยังไม่ได้เปิดโปรเจกต์')
  const resolved = path.resolve(input)
  const relative = path.relative(projectRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('ไม่อนุญาตให้เข้าถึงไฟล์นอกโปรเจกต์')
  return resolved
}

function chatHistoryFile() {
  if (!projectRoot) throw new Error('ยังไม่ได้เปิดโปรเจกต์')
  const identity = process.platform === 'win32' ? projectRoot.toLowerCase() : projectRoot
  const key = createHash('sha256').update(identity).digest('hex')
  const directory = path.join(app.getPath('userData'), 'chat-history')
  mkdirSync(directory, { recursive: true })
  return path.join(directory, `${key}.json`)
}

function projectStorageKey() {
  if (!projectRoot) throw new Error('ยังไม่ได้เปิดโปรเจกต์')
  const identity = process.platform === 'win32' ? projectRoot.toLowerCase() : projectRoot
  return createHash('sha256').update(identity).digest('hex')
}

function undoDirectory() {
  const directory = path.join(app.getPath('userData'), 'undo-history', projectStorageKey())
  mkdirSync(directory, { recursive: true })
  return directory
}

async function collectProjectFiles(directory = projectRoot, depth = 0, result = []) {
  if (depth > 20) throw new Error('โครงสร้างโฟลเดอร์ลึกเกินไปสำหรับระบบย้อนกลับ')
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && ignored.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) await collectProjectFiles(fullPath, depth + 1, result)
    else if (entry.isFile()) result.push({ fullPath, relative: path.relative(projectRoot, fullPath) })
  }
  return result
}

async function createUndoSnapshot(label = '') {
  const files = await collectProjectFiles()
  if (files.length > 10000) throw new Error('โปรเจกต์มีไฟล์มากเกินไปสำหรับระบบย้อนกลับ')
  let totalSize = 0
  for (const file of files) {
    const stat = await fs.stat(file.fullPath)
    totalSize += stat.size
  }
  if (totalSize > 250 * 1024 * 1024) throw new Error('โปรเจกต์มีขนาดเกิน 250 MB ไม่สามารถสร้างจุดย้อนกลับได้')
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const directory = path.join(undoDirectory(), id)
  const backupRoot = path.join(directory, 'files')
  for (const file of files) {
    const destination = path.join(backupRoot, file.relative)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(file.fullPath, destination)
  }
  const manifest = { id, label: String(label).slice(0, 300), createdAt: new Date().toISOString(), files: files.map(file => file.relative) }
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest), 'utf8')
  const snapshots = (await fs.readdir(undoDirectory(), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse()
  for (const expired of snapshots.slice(10)) await fs.rm(path.join(undoDirectory(), expired), { recursive: true, force: true })
  return manifest
}

async function listUndoSnapshots() {
  const directory = undoDirectory()
  const entries = (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse()
  const result = []
  for (const id of entries.slice(0, 10)) {
    try {
      result.push(JSON.parse(await fs.readFile(path.join(directory, id, 'manifest.json'), 'utf8')))
    } catch {}
  }
  return result
}

async function restoreUndoSnapshot(id) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('จุดย้อนกลับไม่ถูกต้อง')
  const directory = path.join(undoDirectory(), id)
  const backupRoot = path.join(directory, 'files')
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
  const savedFiles = new Set(manifest.files.filter(relative => relative && !path.isAbsolute(relative) && !relative.startsWith('..')))
  const currentFiles = await collectProjectFiles()
  for (const file of currentFiles) {
    if (!savedFiles.has(file.relative)) await fs.rm(safePath(file.fullPath), { force: true })
  }
  for (const relative of savedFiles) {
    const destination = safePath(path.join(projectRoot, relative))
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(path.join(backupRoot, relative), destination)
  }
  await fs.rm(directory, { recursive: true, force: true })
  return true
}

function normalizeHistory(payload = {}) {
  const allowedKinds = new Set(['user', 'agent_message', 'output', 'error', 'system'])
  const events = Array.isArray(payload.events) ? payload.events.slice(-300).flatMap(event => {
    if (!event || !allowedKinds.has(event.kind) || typeof event.text !== 'string') return []
    return [{ id: typeof event.id === 'string' ? event.id : undefined, kind: event.kind, text: event.text.slice(0, 100000) }]
  }) : []
  const sessionId = typeof payload.sessionId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.sessionId) ? payload.sessionId : null
  return { version: 1, project: projectRoot, sessionId, events, updatedAt: new Date().toISOString() }
}

async function walk(directory, depth = 0) {
  if (depth > 12) return []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
    if (entry.isDirectory() && ignored.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    result.push({
      name: entry.name,
      path: fullPath,
      directory: entry.isDirectory(),
      children: entry.isDirectory() ? await walk(fullPath, depth + 1) : undefined
    })
  }
  return result
}

function run(file, args, cwd, onData) {
  return new Promise(resolve => {
    const child = spawn(file, args, { cwd, windowsHide: true, shell: false, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => {
      const text = chunk.toString('utf8')
      output += text
      onData?.(text, 'stdout')
    })
    child.stderr.on('data', chunk => {
      const text = chunk.toString('utf8')
      output += text
      onData?.(text, 'stderr')
    })
    child.on('error', error => resolve({ code: -1, output: error.message }))
    child.on('close', code => resolve({ code, output }))
  })
}

function codexRuntime() {
  const codexHome = path.join(app.getPath('userData'), 'codex-home')
  mkdirSync(codexHome, { recursive: true })
  const runtimeEnv = { ...process.env, CODEX_HOME: codexHome }
  if (process.platform === 'win32') {
    const root = app.getAppPath()
    const candidates = [
      path.join(root, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
      path.join(root, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')
    ]
    const executable = candidates.find(existsSync)
    if (executable) return { file: executable, prefix: [], env: runtimeEnv }
    throw new Error('ไม่พบ Codex runtime กรุณาติดตั้ง CodexDesk ใหม่')
  }
  return {
    file: process.execPath,
    prefix: [path.join(app.getAppPath(), 'node_modules', '@openai', 'codex', 'bin', 'codex.js')],
    env: { ...runtimeEnv, ELECTRON_RUN_AS_NODE: '1' }
  }
}

function runCodex(args, cwd, onData) {
  const runtime = codexRuntime()
  return new Promise(resolve => {
    const child = spawn(runtime.file, [...runtime.prefix, ...args], { cwd, windowsHide: true, shell: false, env: runtime.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => {
      const text = chunk.toString('utf8')
      output += text
      onData?.(text, 'stdout')
    })
    child.stderr.on('data', chunk => {
      const text = chunk.toString('utf8')
      output += text
      onData?.(text, 'stderr')
    })
    child.on('error', error => resolve({ code: -1, output: error.message }))
    child.on('close', code => resolve({ code, output }))
  })
}

function stopProcess(child) {
  if (!child || child.killed) return false
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore'
    })
  } else {
    child.kill('SIGTERM')
  }
  return true
}

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  if (result.canceled) return null
  projectRoot = path.resolve(result.filePaths[0])
  return { path: projectRoot, name: path.basename(projectRoot) }
})

ipcMain.handle('project:get', () => projectRoot ? { path: projectRoot, name: path.basename(projectRoot) } : null)
ipcMain.handle('files:list', async () => projectRoot ? walk(projectRoot) : [])
ipcMain.handle('files:read', async (_, input) => {
  const file = safePath(input)
  const stat = await fs.stat(file)
  if (stat.size > 3 * 1024 * 1024) throw new Error('ไฟล์มีขนาดเกิน 3 MB')
  return fs.readFile(file, 'utf8')
})
ipcMain.handle('files:write', async (_, payload) => {
  const file = safePath(payload.path)
  await fs.writeFile(file, payload.content, 'utf8')
  return true
})
ipcMain.handle('history:get', async () => {
  try {
    const history = JSON.parse(await fs.readFile(chatHistoryFile(), 'utf8'))
    return normalizeHistory(history)
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return normalizeHistory()
    throw error
  }
})
ipcMain.handle('history:save', async (_, payload) => {
  const file = chatHistoryFile()
  const temporary = `${file}.tmp`
  await fs.writeFile(temporary, JSON.stringify(normalizeHistory(payload), null, 2), 'utf8')
  await fs.rename(temporary, file)
  return true
})
ipcMain.handle('history:clear', async () => {
  await fs.rm(chatHistoryFile(), { force: true })
  return true
})
ipcMain.handle('undo:create', async (_, label) => createUndoSnapshot(label))
ipcMain.handle('undo:list', async () => listUndoSnapshots())
ipcMain.handle('undo:restore', async (_, id) => restoreUndoSnapshot(id))
ipcMain.handle('git:diff', async () => {
  if (!projectRoot) throw new Error('ยังไม่ได้เปิดโปรเจกต์')
  const check = await run('git', ['rev-parse', '--is-inside-work-tree'], projectRoot)
  if (check.code !== 0) return { code: 0, output: 'โฟลเดอร์นี้ยังไม่ได้ใช้ Git' }
  return run('git', ['diff', '--no-ext-diff', '--no-color'], projectRoot)
})
ipcMain.handle('auth:status', async () => {
  try {
    const result = await runCodex(['login', 'status'], app.getPath('home'))
    return { authenticated: result.code === 0, message: result.output.trim() }
  } catch (error) {
    return { authenticated: false, message: error.message }
  }
})
ipcMain.handle('auth:start', async (_, mode = 'browser') => {
  if (!['browser', 'device'].includes(mode)) throw new Error('รูปแบบการเข้าสู่ระบบไม่ถูกต้อง')
  if (authProcess && !authProcess.killed) stopProcess(authProcess)
  const runtime = codexRuntime()
  const loginArgs = mode === 'device' ? ['login', '--device-auth'] : ['login']
  const currentProcess = spawn(runtime.file, [...runtime.prefix, ...loginArgs], {
    cwd: app.getPath('home'),
    windowsHide: true,
    shell: false,
    env: runtime.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  authProcess = currentProcess
  const send = (type, data) => {
    if (authProcess === currentProcess) mainWindow?.webContents.send('auth:event', { type, data })
  }
  currentProcess.stdout.on('data', chunk => send('output', cleanProcessText(chunk)))
  currentProcess.stderr.on('data', chunk => send('output', cleanProcessText(chunk)))
  currentProcess.on('error', error => {
    if (authProcess !== currentProcess) return
    send('error', error.message)
    authProcess = null
  })
  currentProcess.on('close', code => {
    if (authProcess !== currentProcess) return
    send(code === 0 ? 'success' : 'error', String(code ?? -1))
    authProcess = null
  })
  return true
})
ipcMain.handle('auth:logout', async () => {
  if (codexProcess && !codexProcess.killed) throw new Error('กรุณาหยุดงาน Codex ก่อนออกจากระบบ')
  const result = await runCodex(['logout'], app.getPath('home'))
  if (result.code !== 0) throw new Error(explainCodexFailure(result.output))
  return true
})
ipcMain.handle('app:open-external', async (_, input) => {
  const url = new URL(input)
  const allowed = url.protocol === 'https:' && (url.hostname === 'chatgpt.com' || url.hostname.endsWith('.openai.com'))
  if (!allowed) throw new Error('ไม่อนุญาตให้เปิดลิงก์นี้')
  await shell.openExternal(url.toString())
  return true
})
ipcMain.handle('app:open-link', async (_, input) => {
  const url = new URL(input)
  if (url.protocol !== 'https:') throw new Error('เปิดได้เฉพาะลิงก์ HTTPS')
  await shell.openExternal(url.toString())
  return true
})
ipcMain.handle('clipboard:write', (_, input) => {
  clipboard.writeText(String(input).slice(0, 1000000))
  return true
})
ipcMain.handle('update:state', () => updateState)
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return publishUpdateState({ status: 'current', version: app.getVersion() })
  await autoUpdater.checkForUpdates()
  return true
})
ipcMain.handle('update:download', async () => {
  await autoUpdater.downloadUpdate()
  return true
})
ipcMain.handle('update:install', () => {
  if (updateState.status !== 'downloaded') return false
  autoUpdater.quitAndInstall(false, true)
  return true
})
ipcMain.handle('codex:run', async (_, options) => {
  if (!projectRoot) throw new Error('ยังไม่ได้เปิดโปรเจกต์')
  if (codexProcess && !codexProcess.killed) throw new Error('Codex กำลังทำงานอยู่')
  const runtime = codexRuntime()
  codexStopRequested = false
  const accessArgs = options.allowEdit
    ? ['--sandbox', 'danger-full-access', '--ask-for-approval', 'never']
    : ['--sandbox', 'read-only', '--ask-for-approval', 'never']
  const modeInstruction = options.allowEdit
    ? 'แก้ไขได้เฉพาะไฟล์ภายในโฟลเดอร์โปรเจกต์ปัจจุบัน ห้ามเข้าถึงหรือแก้ไขไฟล์ภายนอกโปรเจกต์'
    : 'อ่านและวิเคราะห์เท่านั้น ห้ามแก้ไข สร้าง หรือลบไฟล์'
  const prompt = [
    'Environment: Windows Server 2019.',
    'Do not use powershell.exe or PowerShell commands. Run executables directly, such as rg.exe and git.exe.',
    'Do not run Git commands unless a .git directory exists.',
    'Do not expose internal tool logs in the final response.',
    modeInstruction,
    '',
    'คำสั่งจากผู้ใช้:',
    options.prompt
  ].join('\n')
  const sessionId = typeof options.sessionId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(options.sessionId) ? options.sessionId : null
  const execArgs = ['exec', '--json', '--skip-git-repo-check']
  if (sessionId) execArgs.push('resume', sessionId, prompt)
  else execArgs.push(prompt)
  const args = [...runtime.prefix, ...accessArgs, ...execArgs]
  codexProcess = spawn(runtime.file, args, { cwd: projectRoot, windowsHide: true, shell: false, env: runtime.env, stdio: ['ignore', 'pipe', 'pipe'] })
  const send = (type, data) => mainWindow?.webContents.send('codex:event', { type, data })
  const cleanOutput = chunk => cleanProcessText(chunk).replace(/Reading additional input from stdin\.\.\.\r?\n?/g, '')
  let diagnostics = ''
  codexProcess.stdout.on('data', chunk => {
    const text = cleanOutput(chunk)
    if (text) send('stdout', text)
  })
  codexProcess.stderr.on('data', chunk => {
    diagnostics = (diagnostics + cleanOutput(chunk)).slice(-12000)
  })
  return new Promise(resolve => {
    codexProcess.on('error', error => {
      send('error', error.message)
      codexProcess = null
      resolve({ code: -1 })
    })
    codexProcess.on('close', code => {
      if (code !== 0 && !codexStopRequested) send('error', explainCodexFailure(diagnostics))
      send('done', String(code ?? -1))
      codexProcess = null
      codexStopRequested = false
      resolve({ code })
    })
  })
})
ipcMain.handle('codex:stop', () => {
  codexStopRequested = true
  return stopProcess(codexProcess)
})

app.whenReady().then(() => {
  createWindow()
  setupAutoUpdater()
})
app.on('before-quit', () => {
  stopProcess(codexProcess)
  stopProcess(authProcess)
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
