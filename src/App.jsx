import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Check, ChevronDown, ChevronRight, CircleStop, Code2, Command, Copy, Download, ExternalLink, File, FilePenLine, Folder, FolderOpen, GitCompare, ListTodo, LogIn, LogOut, RefreshCw, Save, Send, ShieldCheck, Trash2, Undo2, X } from 'lucide-react'

const api = window.codexDesk
const CHAT_COMMANDS = [
  { name: '/help', description: 'ดูคำสั่งทั้งหมด' },
  { name: '/new', description: 'เริ่มแชทใหม่ในโฟลเดอร์นี้' },
  { name: '/status', description: 'ดูสถานะโปรเจกต์และ Codex' },
  { name: '/diff', description: 'เปิด Git Diff' },
  { name: '/files', description: 'เปิดรายการไฟล์' },
  { name: '/code', description: 'เปิดตัวแก้ไขโค้ด' },
  { name: '/activity', description: 'เปิดกิจกรรมแบบละเอียด' },
  { name: '/readonly', description: 'เปลี่ยนเป็นโหมดอ่านอย่างเดียว' },
  { name: '/write', description: 'อนุญาตให้แก้ไขไฟล์' },
  { name: '/approval', description: 'ตั้งค่า ask หรือ auto' },
  { name: '/update', description: 'ตรวจอัปเดตแอป' },
  { name: '/copy', description: 'คัดลอกแชททั้งหมด' },
  { name: '/undo', description: 'ย้อนกลับงานล่าสุด' },
  { name: '/login', description: 'เปิดหน้าบัญชี ChatGPT' },
  { name: '/logout', description: 'ออกจากระบบ ChatGPT' },
  { name: '/stop', description: 'หยุดงานและล้างคิว' }
]

function FileNode({ node, onOpen, level = 0 }) {
  const [open, setOpen] = useState(level < 1)
  if (node.directory) {
    return <div>
      <button className="tree-row" style={{ paddingLeft: 10 + level * 14 }} onClick={() => setOpen(value => !value)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? <FolderOpen size={14} /> : <Folder size={14} />}
        <span>{node.name}</span>
      </button>
      <AnimatePresence initial={false}>{open && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>{node.children?.map(child => <FileNode key={child.path} node={child} onOpen={onOpen} level={level + 1} />)}</motion.div>}</AnimatePresence>
    </div>
  }
  return <button className="tree-row file-row" style={{ paddingLeft: 25 + level * 14 }} onClick={() => onOpen(node)}><File size={13} /><span>{node.name}</span></button>
}

function MarkdownMessage({ text }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      a: ({ href, children }) => <button className="markdown-link" onClick={() => href && api.openLink(href)}>{children}</button>
    }}
  >{text}</ReactMarkdown>
}

function diffStats(diff = '') {
  let additions = 0
  let deletions = 0
  for (const line of String(diff).split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

function fileChangeDetails(item) {
  return (Array.isArray(item.changes) ? item.changes : []).map(change => {
    const stats = diffStats(change.diff || change.patch || '')
    return {
      path: change.path || change.file_path || 'ไฟล์',
      kind: change.kind || 'update',
      ...stats
    }
  })
}

function App() {
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [currentFile, setCurrentFile] = useState(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [diff, setDiff] = useState('')
  const [prompt, setPrompt] = useState('')
  const [allowEdit, setAllowEdit] = useState(true)
  const [approvalMode, setApprovalMode] = useState('ask')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState([])
  const [authenticated, setAuthenticated] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authOutput, setAuthOutput] = useState('')
  const [authState, setAuthState] = useState('idle')
  const [authMode, setAuthMode] = useState('browser')
  const [updater, setUpdater] = useState({ status: 'idle', version: null, percent: 0 })
  const [queue, setQueue] = useState([])
  const [activity, setActivity] = useState([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [mobileView, setMobileView] = useState('chat')
  const [sessionId, setSessionId] = useState(null)
  const [historyReady, setHistoryReady] = useState(false)
  const [undoStack, setUndoStack] = useState([])
  const codexBuffer = useRef('')
  const conversationEnd = useRef(null)
  const runningRef = useRef(false)
  const queueRef = useRef([])
  const leftCtrlPressed = useRef(false)
  const sessionIdRef = useRef(null)

  const dirty = currentFile && content !== savedContent
  const commandSuggestions = prompt.startsWith('/') && !prompt.includes('\n') ? CHAT_COMMANDS.filter(command => command.name.startsWith(prompt.split(/\s+/)[0].toLowerCase())).slice(0, 7) : []
  const liveActivity = activity.slice().reverse().find(item => item.status === 'running') || activity.at(-1)
  const currentTaskIndex = activity.map(item => item.type).lastIndexOf('task')
  const currentTaskActivity = currentTaskIndex >= 0 ? activity.slice(currentTaskIndex) : activity
  const liveStats = currentTaskActivity.reduce((total, item) => ({ additions: total.additions + (item.additions || 0), deletions: total.deletions + (item.deletions || 0) }), { additions: 0, deletions: 0 })

  useEffect(() => api.getProject().then(value => value && loadProject(value)), [])

  useEffect(() => {
    api.authStatus().then(value => {
      setAuthenticated(value.authenticated)
      if (!value.authenticated) startLogin()
    })
  }, [])

  useEffect(() => api.onCodexEvent(event => {
    if (event.type === 'done') {
      parseCodexOutput('', true)
    }
    if (event.type === 'stdout') parseCodexOutput(event.data)
    if (event.type === 'stderr' || event.type === 'error') setEvents(items => [...items, { kind: 'error', text: event.data }])
  }), [])

  useEffect(() => {
    const keyDown = event => {
      if (event.code === 'ControlLeft') leftCtrlPressed.current = true
      if (event.code === 'KeyO' && leftCtrlPressed.current) {
        event.preventDefault()
        setActivityOpen(value => !value)
      }
    }
    const keyUp = event => {
      if (event.code === 'ControlLeft') leftCtrlPressed.current = false
    }
    const reset = () => { leftCtrlPressed.current = false }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', reset)
    }
  }, [])

  useEffect(() => api.onAuthEvent(event => {
    if (event.type === 'output') setAuthOutput(value => value + event.data)
    if (event.type === 'success') {
      setAuthState('success')
      setAuthenticated(true)
    }
    if (event.type === 'error') setAuthState('error')
  }), [])

  useEffect(() => {
    api.updateState().then(setUpdater)
    return api.onUpdateEvent(setUpdater)
  }, [])

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: running ? 'smooth' : 'auto', block: 'end' })
  }, [events, running])

  useEffect(() => {
    if (!project || !historyReady) return undefined
    const timeout = window.setTimeout(() => {
      api.historySave({ events, sessionId }).catch(() => {})
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [events, sessionId, project, historyReady])

  async function startLogin(mode = 'browser') {
    setAuthOpen(true)
    setAuthOutput('')
    setAuthState('working')
    setAuthMode(mode)
    try {
      await api.authStart(mode)
    } catch (error) {
      setAuthOutput(error.message)
      setAuthState('error')
    }
  }

  function openAccount() {
    if (!authenticated) {
      startLogin()
      return
    }
    setAuthState('success')
    setAuthOpen(true)
  }

  async function updateApp() {
    if (['checking', 'downloading'].includes(updater.status)) return
    if (updater.status === 'available') return api.updateDownload()
    if (updater.status === 'downloaded') return api.updateInstall()
    return api.updateCheck()
  }

  const updateLabel = ({
    checking: 'กำลังตรวจ...',
    available: `ดาวน์โหลด ${updater.version || ''}`,
    downloading: `กำลังดาวน์โหลด ${updater.percent}%`,
    downloaded: 'ติดตั้งอัปเดต',
    error: 'ตรวจใหม่'
  })[updater.status] || 'ตรวจอัปเดต'

  const authUrl = authOutput.match(/https:\/\/(?:auth\.openai\.com|chatgpt\.com)\/[A-Za-z0-9/_?=&.%-]+/)?.[0]
  const deviceCode = authOutput.match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0]

  async function loadProject(value) {
    setHistoryReady(false)
    setProject(value)
    setEvents([])
    const [nextFiles, history, undoHistory] = await Promise.all([api.listFiles(), api.historyGet(), api.undoList()])
    setFiles(nextFiles)
    setUndoStack(undoHistory)
    sessionIdRef.current = history.sessionId || null
    setSessionId(history.sessionId || null)
    setEvents((history.events || []).map(event => ({ ...event, queued: false })))
    setHistoryReady(true)
  }

  async function openProject() {
    if (project && historyReady) await api.historySave({ events, sessionId }).catch(() => {})
    setHistoryReady(false)
    const value = await api.openProject()
    if (value) {
      setCurrentFile(null)
      setContent('')
      setSavedContent('')
      queueRef.current = []
      setQueue([])
      setActivity([])
      await loadProject(value)
    } else {
      setHistoryReady(true)
    }
  }

  async function refreshFiles() {
    if (project) setFiles(await api.listFiles())
  }

  async function openFile(node) {
    if (dirty && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการเปิดไฟล์อื่นหรือไม่')) return
    try {
      const text = await api.readFile(node.path)
      setCurrentFile(node)
      setContent(text)
      setSavedContent(text)
      setMobileView('editor')
    } catch (error) {
      alert(error.message)
    }
  }

  async function saveFile() {
    if (!currentFile) return
    await api.writeFile(currentFile.path, content)
    setSavedContent(content)
  }

  async function loadDiff() {
    const result = await api.gitDiff()
    setDiff(result.output || 'ไม่มีการเปลี่ยนแปลง')
  }

  function parseCodexOutput(raw, flush = false) {
    codexBuffer.current += raw
    const lines = codexBuffer.current.split(/\r?\n/)
    const tail = lines.pop() ?? ''
    codexBuffer.current = flush ? '' : tail
    if (flush && tail) lines.push(tail)
    for (const line of lines.filter(Boolean)) {
      try {
        const event = JSON.parse(line)
        if (event.type === 'thread.started' && event.thread_id) {
          sessionIdRef.current = event.thread_id
          setSessionId(event.thread_id)
        }
        if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          setEvents(items => [...items, { kind: 'agent_message', text: event.item.text }])
        }
        if (event.item && event.item.type !== 'agent_message') updateActivity(event)
        if (event.type === 'error') {
          setEvents(items => [...items, { kind: 'error', text: event.message || 'Codex ทำงานไม่สำเร็จ' }])
        }
      } catch {
        if (!/codex_core|Wall time:|Exit code:|rejected: blocked by policy/i.test(line)) {
          setEvents(items => [...items, { kind: 'output', text: line }])
        }
      }
    }
  }

  function updateActivity(event) {
    const item = event.item
    const id = item.id || `${item.type}-${Date.now()}`
    const labels = { reasoning: 'กำลังวิเคราะห์', file_change: 'กำลังแก้ไขไฟล์', fileChange: 'กำลังแก้ไขไฟล์', command_execution: 'กำลังรันคำสั่ง', commandExecution: 'กำลังรันคำสั่ง', web_search: 'กำลังค้นหา', webSearch: 'กำลังค้นหา', mcp_tool_call: 'กำลังใช้เครื่องมือ', mcpToolCall: 'กำลังใช้เครื่องมือ' }
    const changes = ['file_change', 'fileChange'].includes(item.type) ? fileChangeDetails(item) : []
    const additions = changes.reduce((total, change) => total + change.additions, 0)
    const deletions = changes.reduce((total, change) => total + change.deletions, 0)
    const title = changes.length > 0 ? `แก้ไข ${changes.length} ไฟล์` : item.command || item.query || item.name || item.path || labels[item.type] || item.type
    const output = item.aggregated_output || item.output || item.text || ''
    const status = event.type === 'item.started' ? 'running' : item.status || 'completed'
    setActivity(items => {
      const index = items.findIndex(value => value.id === id)
      const next = { id, type: item.type, title: String(title), output: String(output).slice(-1200), status, changes, additions, deletions }
      if (index < 0) return [...items.slice(-99), next]
      return items.map((value, position) => position === index ? { ...value, ...next } : value)
    })
  }

  async function executeTask(task) {
    runningRef.current = true
    setRunning(true)
    setEvents(items => items.map(event => event.id === task.id ? { ...event, queued: false } : event))
    setActivity(items => [...items.slice(-99), { id: `task-${task.id}`, type: 'task', title: task.text, output: '', status: 'running' }])
    let completed = false
    try {
      if (task.allowEdit) {
        const snapshot = await api.undoCreate(task.text)
        setUndoStack(items => [snapshot, ...items].slice(0, 10))
      }
      const result = await api.codexRun({ prompt: task.text, allowEdit: task.allowEdit, sessionId: sessionIdRef.current })
      completed = result.code === 0
      await refreshFiles()
      await loadDiff()
    } catch (error) {
      setEvents(items => [...items, { kind: 'error', text: error.message }])
    }
    setActivity(items => items.map(item => item.id === `task-${task.id}` ? { ...item, status: completed ? 'completed' : 'failed' } : item))
    const next = queueRef.current.shift()
    setQueue([...queueRef.current])
    if (next) {
      void executeTask(next)
    } else {
      runningRef.current = false
      setRunning(false)
    }
  }

  function sendPrompt() {
    const text = prompt.trim()
    if (!text || !project) return
    if (text.startsWith('/')) {
      setPrompt('')
      void runChatCommand(text)
      return
    }
    if (allowEdit && approvalMode === 'ask' && !confirm('อนุญาตให้ Codex แก้ไขไฟล์และรันคำสั่งสำหรับงานนี้หรือไม่')) return
    const task = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, allowEdit }
    setPrompt('')
    setEvents(items => [...items, { id: task.id, kind: 'user', text, queued: runningRef.current }])
    if (runningRef.current) {
      queueRef.current.push(task)
      setQueue([...queueRef.current])
      return
    }
    void executeTask(task)
  }

  function addSystemMessage(text) {
    setEvents(items => [...items, { id: `system-${Date.now()}`, kind: 'system', text }])
  }

  async function runChatCommand(input) {
    const [name, ...args] = input.trim().split(/\s+/)
    const command = name.toLowerCase()
    if (command === '/help') {
      addSystemMessage(`### คำสั่ง CodexDesk\n${CHAT_COMMANDS.map(item => `- \`${item.name}\` ${item.description}`).join('\n')}`)
      return
    }
    if (command === '/new' || command === '/clear') {
      await clearHistory()
      return
    }
    if (command === '/status') {
      addSystemMessage(`### สถานะ\n- โปรเจกต์: **${project?.name || 'ยังไม่ได้เปิด'}**\n- บัญชี: **${authenticated ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}**\n- Codex: **${running ? 'กำลังทำงาน' : 'พร้อมใช้งาน'}**\n- คิว: **${queue.length}**\n- สิทธิ์: **${allowEdit ? 'แก้ไขไฟล์ได้' : 'อ่านอย่างเดียว'}**\n- การอนุมัติ: **${approvalMode === 'ask' ? 'ถามก่อน' : 'อัตโนมัติ'}**`)
      return
    }
    if (command === '/diff') {
      await loadDiff()
      setMobileView('editor')
      addSystemMessage('เปิด Git Diff แล้ว')
      return
    }
    if (command === '/files') {
      setMobileView('files')
      return
    }
    if (command === '/code') {
      setMobileView('editor')
      return
    }
    if (command === '/activity') {
      setActivityOpen(true)
      return
    }
    if (command === '/readonly') {
      setAllowEdit(false)
      addSystemMessage('เปลี่ยนเป็นโหมดอ่านอย่างเดียวแล้ว')
      return
    }
    if (command === '/write') {
      setAllowEdit(true)
      addSystemMessage('อนุญาตให้ Codex แก้ไขไฟล์แล้ว')
      return
    }
    if (command === '/approval') {
      const mode = args[0]?.toLowerCase()
      if (!['ask', 'auto'].includes(mode)) {
        addSystemMessage('ใช้ `/approval ask` หรือ `/approval auto`')
        return
      }
      setApprovalMode(mode)
      addSystemMessage(mode === 'ask' ? 'ตั้งเป็นถามก่อนเริ่มงานแล้ว' : 'ตั้งเป็นทำงานอัตโนมัติแล้ว')
      return
    }
    if (command === '/update') {
      await updateApp()
      addSystemMessage('กำลังตรวจอัปเดต')
      return
    }
    if (command === '/copy') {
      await copyChat()
      return
    }
    if (command === '/undo') {
      await undoLastTask()
      return
    }
    if (command === '/login') {
      openAccount()
      return
    }
    if (command === '/logout') {
      await signOut()
      return
    }
    if (command === '/stop') {
      stopCodex()
      addSystemMessage('หยุดงานและล้างคิวแล้ว')
      return
    }
    addSystemMessage(`ไม่พบคำสั่ง \`${name}\` พิมพ์ \`/help\` เพื่อดูคำสั่งทั้งหมด`)
  }

  function stopCodex() {
    queueRef.current = []
    setQueue([])
    api.codexStop()
  }

  async function clearHistory() {
    if (!confirm('ลบประวัติแชทของโฟลเดอร์นี้ทั้งหมดหรือไม่')) return
    await api.historyClear()
    sessionIdRef.current = null
    setSessionId(null)
    setEvents([])
    setActivity([])
  }

  async function copyChat() {
    const transcript = events.map(event => `${event.kind === 'user' ? 'คุณ' : event.kind === 'system' ? 'ระบบ' : 'Codex'}\n${event.text}`).join('\n\n')
    await api.copyText(transcript)
    addSystemMessage('คัดลอกแชททั้งหมดแล้ว')
  }

  async function undoLastTask() {
    const snapshot = undoStack[0]
    if (!snapshot || running) return
    if (!confirm(`ย้อนกลับไฟล์ทั้งหมดไปก่อนงาน "${snapshot.label || 'ล่าสุด'}" หรือไม่`)) return
    try {
      await api.undoRestore(snapshot.id)
      setUndoStack(await api.undoList())
      await refreshFiles()
      await loadDiff()
      if (currentFile) {
        try {
          const restored = await api.readFile(currentFile.path)
          setContent(restored)
          setSavedContent(restored)
        } catch {
          setCurrentFile(null)
          setContent('')
          setSavedContent('')
        }
      }
      addSystemMessage('ย้อนกลับไฟล์ไปก่อนงานล่าสุดแล้ว')
    } catch (error) {
      addSystemMessage(`ย้อนกลับไม่สำเร็จ: ${error.message}`)
    }
  }

  async function signOut() {
    if (!authenticated || running) return
    if (!confirm('ออกจากระบบ ChatGPT ใน CodexDesk หรือไม่')) return
    try {
      await api.authLogout()
      setAuthenticated(false)
      setAuthOpen(false)
      addSystemMessage('ออกจากระบบ ChatGPT แล้ว')
    } catch (error) {
      addSystemMessage(`ออกจากระบบไม่สำเร็จ: ${error.message}`)
    }
  }

  const language = useMemo(() => {
    const extension = currentFile?.name.split('.').pop()?.toLowerCase()
    return ({ js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', json: 'json', html: 'html', css: 'css', cs: 'csharp', java: 'java', go: 'go', rs: 'rust', md: 'markdown', yml: 'yaml', yaml: 'yaml' })[extension] || 'plaintext'
  }, [currentFile])

  return <div className="app-shell">
    <header className="titlebar">
      <div className="brand"><div className="brand-mark"><Code2 size={15} /></div><span>CodexDesk</span></div>
      <button className="project-switcher" onClick={openProject}><FolderOpen size={15} /><span>{project?.name || 'เปิดโปรเจกต์'}</span><ChevronDown size={13} /></button>
      <div className="title-actions">
        <button className={`update-button ${updater.status}`} onClick={updateApp} disabled={['checking', 'downloading'].includes(updater.status)}>{updater.status === 'downloaded' || updater.status === 'available' ? <Download size={13} /> : <RefreshCw size={13} />}<span>{updateLabel}</span></button>
        <button className={`account-button ${authenticated ? 'connected' : ''}`} onClick={openAccount}>{authenticated ? <Check size={13} /> : <LogIn size={13} />}<span>{authenticated ? 'เชื่อมต่อแล้ว' : 'เชื่อมต่อ ChatGPT'}</span></button>
        <span className={`status-dot ${running ? 'active' : ''}`} /><span>{running ? 'กำลังทำงาน' : 'พร้อมใช้งาน'}</span>
      </div>
    </header>

    <main className={`workspace view-${mobileView}`}>
      <aside className="rail">
        <button className={`rail-button ${mobileView === 'files' ? 'active' : ''}`} onClick={() => setMobileView('files')} title="ไฟล์"><FolderOpen size={18} /></button>
        <button className={`rail-button ${mobileView === 'editor' ? 'active' : ''}`} onClick={() => setMobileView('editor')} title="ตัวแก้ไขโค้ด"><Code2 size={18} /></button>
        <button className={`rail-button ${mobileView === 'chat' ? 'active' : ''}`} onClick={() => setMobileView('chat')} title="Codex"><Bot size={18} /></button>
        <button className="rail-button" onClick={() => { setMobileView('editor'); loadDiff() }} title="Git Diff"><GitCompare size={18} /></button>
        <div className="rail-spacer" />
        <button className={`rail-button ${authenticated ? 'signed-in' : ''}`} onClick={openAccount} title={authenticated ? 'บัญชี ChatGPT' : 'เข้าสู่ระบบ ChatGPT'}>{authenticated ? <Check size={18} /> : <LogIn size={18} />}</button>
      </aside>

      <aside className="explorer">
        <div className="panel-heading"><span>EXPLORER</span><button onClick={refreshFiles}><RefreshCw size={14} /></button></div>
        <div className="project-label">{project?.name || 'NO PROJECT'}</div>
        <div className="file-tree">{files.map(node => <FileNode key={node.path} node={node} onOpen={openFile} />)}</div>
      </aside>

      <section className="editor-area">
        <div className="editor-tabs">
          {currentFile ? <div className="editor-tab active"><File size={13} /><span>{currentFile.name}</span>{dirty && <i />}</div> : <div className="empty-tab">เลือกไฟล์จาก Explorer</div>}
          <button className="save-button" disabled={!dirty} onClick={saveFile}><Save size={14} />บันทึก</button>
        </div>
        <div className="editor-wrap">
          <Editor value={content} onChange={value => setContent(value ?? '')} language={language} theme="vs-dark" options={{ minimap: { enabled: true }, fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 14, padding: { top: 16 }, smoothScrolling: true, cursorSmoothCaretAnimation: 'on', renderLineHighlight: 'all', wordWrap: 'off', automaticLayout: true }} />
        </div>
        <div className="bottom-panel">
          <div className="diff-heading"><GitCompare size={14} /><span>Git Diff</span><button onClick={loadDiff}><RefreshCw size={13} />รีเฟรช</button></div>
          <pre className="diff-view">{diff || 'การเปลี่ยนแปลงของ Codex จะแสดงที่นี่'}</pre>
        </div>
      </section>

      <aside className="agent-panel">
        <div className="agent-heading"><div><Bot size={17} /><span>Codex</span></div><div className="agent-actions"><button className="icon-action" disabled={events.length === 0} onClick={copyChat} title="คัดลอกแชททั้งหมด"><Copy size={14} /></button><button className="icon-action" disabled={running || undoStack.length === 0} onClick={undoLastTask} title="ย้อนกลับงานล่าสุด"><Undo2 size={14} /></button><button className={activityOpen ? 'active' : ''} onClick={() => setActivityOpen(value => !value)} title="Ctrl ซ้าย + O"><ListTodo size={15} />กิจกรรม{queue.length > 0 && <b>{queue.length}</b>}</button><button disabled={!running} onClick={stopCodex}><CircleStop size={15} />หยุด</button></div></div>
        <div className="agent-meta"><span>Local workspace</span><span>{allowEdit ? 'Workspace write' : 'Read only'}</span></div>
        <div className="conversation">
          {events.length === 0 && <div className="welcome"><div className="welcome-icon"><Bot size={22} /></div><h2>เริ่มสร้างด้วย Codex</h2><p>บอกสิ่งที่ต้องการแก้ไขในโปรเจกต์นี้</p></div>}
          {events.map((event, index) => <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} key={event.id || index} className={`message ${event.kind} ${event.queued ? 'queued' : ''}`}><div className="message-label"><span>{event.kind === 'user' ? event.queued ? 'คุณ · อยู่ในคิว' : 'คุณ' : event.kind === 'system' ? 'ระบบ' : 'Codex'}</span><button onClick={() => api.copyText(event.text)} title="คัดลอกข้อความ"><Copy size={11} /></button></div><div className="markdown"><MarkdownMessage text={event.text} /></div></motion.div>)}
          {running && <div className="thinking"><i /><i /><i /></div>}
          <div ref={conversationEnd} className="conversation-end" />
        </div>
        {running && <div className="live-status"><div><i /><span>{liveActivity?.title || 'กำลังเริ่มงาน'}</span></div>{(liveStats.additions > 0 || liveStats.deletions > 0) && <strong><b>+{liveStats.additions}</b><em>-{liveStats.deletions}</em></strong>}</div>}
        <AnimatePresence>{activityOpen && <motion.div className="activity-drawer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
          <div className="activity-heading"><div><ListTodo size={15} /><span>กิจกรรมของ Codex</span></div><div className="activity-heading-actions"><kbd>Ctrl + O</kbd><button onClick={clearHistory} title="ล้างประวัติแชท"><Trash2 size={13} /></button></div></div>
          {queue.length > 0 && <div className="queue-section"><strong>คิวข้อความ {queue.length}</strong>{queue.map((task, index) => <div className="queue-item" key={task.id}><span>{index + 1}</span><p>{task.text}</p></div>)}</div>}
          <div className="activity-list">{activity.length === 0 ? <div className="activity-empty">ยังไม่มีกิจกรรม</div> : activity.slice().reverse().map(item => <div className={`activity-item ${item.status}`} key={item.id}><i /><div><div className="activity-title"><strong>{item.title}</strong>{(item.additions > 0 || item.deletions > 0) && <span><b>+{item.additions}</b><em>-{item.deletions}</em></span>}</div>{item.changes?.length > 0 && <div className="file-change-list">{item.changes.map((change, index) => <div className="file-change-row" key={`${change.path}-${index}`}><FilePenLine size={12} /><span>{change.path}</span><b>+{change.additions}</b><em>-{change.deletions}</em></div>)}</div>}{item.output && <pre>{item.output}</pre>}</div></div>)}</div>
        </motion.div>}</AnimatePresence>
        <div className="composer">
          {commandSuggestions.length > 0 && <div className="command-menu"><div className="command-menu-label"><Command size={12} />คำสั่ง</div>{commandSuggestions.map(command => <button key={command.name} onClick={() => setPrompt(command.name === '/approval' ? '/approval ' : command.name)}><code>{command.name}</code><span>{command.description}</span></button>)}</div>}
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendPrompt() } }} placeholder={project ? 'สั่งงาน Codex…' : 'เปิดโปรเจกต์ก่อน'} disabled={!project} />
          {queue.length > 0 && <div className="queue-indicator">มี {queue.length} ข้อความรอทำงาน</div>}
          <div className="composer-footer">
            <div className="composer-options">
              <button className="permission" onClick={() => setAllowEdit(value => !value)}><span className={allowEdit ? 'enabled' : ''} />{allowEdit ? 'แก้ไขไฟล์ได้' : 'อ่านอย่างเดียว'}</button>
              <button className="approval-mode" onClick={() => setApprovalMode(value => value === 'ask' ? 'auto' : 'ask')} title="รูปแบบการอนุมัติ"><ShieldCheck size={13} />{approvalMode === 'ask' ? 'ถามก่อน' : 'อัตโนมัติ'}</button>
            </div>
            <button className="send-button" onClick={sendPrompt} disabled={!prompt.trim() || !project}><Send size={15} /></button>
          </div>
        </div>
      </aside>
    </main>
    <AnimatePresence>{authOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="auth-modal" initial={{ opacity: 0, scale: .96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <button className="modal-close" onClick={() => setAuthOpen(false)}><X size={16} /></button>
        <div className={`auth-symbol ${authState}`}><LogIn size={21} /></div>
        <h2>{authState === 'success' ? 'เข้าสู่ระบบสำเร็จ' : authMode === 'browser' ? 'เข้าสู่ระบบด้วย ChatGPT' : 'เข้าสู่ระบบด้วยรหัสยืนยัน'}</h2>
        {authState === 'success' ? <><p>บัญชี ChatGPT พร้อมใช้งานกับ CodexDesk แล้ว</p><button className="auth-secondary logout-button" onClick={signOut} disabled={running}><LogOut size={14} />ออกจากระบบ</button></> : <>
          <p>{authMode === 'browser' ? 'เข้าสู่ระบบในเบราว์เซอร์ แล้วกลับมาที่ CodexDesk' : 'เปิดหน้าตรวจสอบและกรอกรหัสแบบใช้ครั้งเดียว'}</p>
          {authMode === 'device' && deviceCode && <button className="device-code" onClick={() => navigator.clipboard.writeText(deviceCode)}><strong>{deviceCode}</strong><Copy size={14} /></button>}
          {authUrl && authState === 'working' && <button className="auth-primary" onClick={() => api.openExternal(authUrl)}><ExternalLink size={15} />เปิดหน้าเข้าสู่ระบบ</button>}
          {authState === 'working' && !authUrl && <div className="auth-loading"><i /><span>{authMode === 'browser' ? 'กำลังเปิดหน้าเข้าสู่ระบบ' : 'กำลังสร้างรหัสยืนยัน'}</span></div>}
          {authState === 'working' && authMode === 'browser' && <button className="auth-secondary" onClick={() => startLogin('device')}>ใช้รหัสยืนยันแทน</button>}
          {authState === 'working' && authMode === 'device' && <button className="auth-secondary" onClick={() => startLogin('browser')}>กลับไปเข้าสู่ระบบผ่านเบราว์เซอร์</button>}
          {authState === 'error' && <pre className="auth-error">{authOutput || 'ไม่สามารถเข้าสู่ระบบได้'}</pre>}
          {authState === 'error' && <button className="auth-primary" onClick={() => startLogin('browser')}>ลองเข้าสู่ระบบอีกครั้ง</button>}
        </>}
      </motion.div>
    </motion.div>}</AnimatePresence>
  </div>
}

export default App
