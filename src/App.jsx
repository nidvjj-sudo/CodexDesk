import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { motion, AnimatePresence } from 'motion/react'
import { Bot, Check, ChevronDown, ChevronRight, CircleStop, Code2, Copy, Download, ExternalLink, File, Folder, FolderOpen, GitCompare, LogIn, RefreshCw, Save, Send, Settings2, X } from 'lucide-react'

const api = window.codexDesk

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

function App() {
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [currentFile, setCurrentFile] = useState(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [diff, setDiff] = useState('')
  const [prompt, setPrompt] = useState('')
  const [allowEdit, setAllowEdit] = useState(true)
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState([])
  const [authenticated, setAuthenticated] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authOutput, setAuthOutput] = useState('')
  const [authState, setAuthState] = useState('idle')
  const [authMode, setAuthMode] = useState('browser')
  const [updater, setUpdater] = useState({ status: 'idle', version: null, percent: 0 })
  const codexBuffer = useRef('')
  const conversationEnd = useRef(null)

  const dirty = currentFile && content !== savedContent

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
      setRunning(false)
    }
    if (event.type === 'stdout') parseCodexOutput(event.data)
    if (event.type === 'stderr' || event.type === 'error') setEvents(items => [...items, { kind: 'error', text: event.data }])
  }), [])

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
    setProject(value)
    setFiles(await api.listFiles())
  }

  async function openProject() {
    const value = await api.openProject()
    if (value) {
      setCurrentFile(null)
      setContent('')
      setSavedContent('')
      await loadProject(value)
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
        if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          setEvents(items => [...items, { kind: 'agent_message', text: event.item.text }])
        }
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

  async function sendPrompt() {
    const text = prompt.trim()
    if (!text || running || !project) return
    setPrompt('')
    setEvents(items => [...items, { kind: 'user', text }])
    setRunning(true)
    try {
      await api.codexRun({ prompt: text, allowEdit })
      await refreshFiles()
      await loadDiff()
    } catch (error) {
      setRunning(false)
      setEvents(items => [...items, { kind: 'error', text: error.message }])
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

    <main className="workspace">
      <aside className="rail">
        <button className="rail-button active"><Code2 size={18} /></button>
        <button className="rail-button" onClick={loadDiff}><GitCompare size={18} /></button>
        <div className="rail-spacer" />
        <button className={`rail-button ${authenticated ? 'signed-in' : ''}`} onClick={openAccount}>{authenticated ? <Check size={18} /> : <LogIn size={18} />}</button>
        <button className="rail-button"><Settings2 size={18} /></button>
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
        <div className="agent-heading"><div><Bot size={17} /><span>Codex</span></div><button disabled={!running} onClick={() => api.codexStop()}><CircleStop size={15} />หยุด</button></div>
        <div className="agent-meta"><span>Local workspace</span><span>{allowEdit ? 'Workspace write' : 'Read only'}</span></div>
        <div className="conversation">
          {events.length === 0 && <div className="welcome"><div className="welcome-icon"><Bot size={22} /></div><h2>เริ่มสร้างด้วย Codex</h2><p>บอกสิ่งที่ต้องการแก้ไขในโปรเจกต์นี้</p></div>}
          {events.map((event, index) => <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} key={index} className={`message ${event.kind}`}><span>{event.kind === 'user' ? 'คุณ' : 'Codex'}</span><p>{event.text}</p></motion.div>)}
          {running && <div className="thinking"><i /><i /><i /></div>}
          <div ref={conversationEnd} className="conversation-end" />
        </div>
        <div className="composer">
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendPrompt() } }} placeholder={project ? 'สั่งงาน Codex…' : 'เปิดโปรเจกต์ก่อน'} disabled={!project} />
          <div className="composer-footer">
            <button className="permission" onClick={() => setAllowEdit(value => !value)}><span className={allowEdit ? 'enabled' : ''} />{allowEdit ? 'แก้ไขไฟล์ได้' : 'อ่านอย่างเดียว'}</button>
            <button className="send-button" onClick={sendPrompt} disabled={!prompt.trim() || running || !project}><Send size={15} /></button>
          </div>
        </div>
      </aside>
    </main>
    <AnimatePresence>{authOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="auth-modal" initial={{ opacity: 0, scale: .96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <button className="modal-close" onClick={() => setAuthOpen(false)}><X size={16} /></button>
        <div className={`auth-symbol ${authState}`}><LogIn size={21} /></div>
        <h2>{authState === 'success' ? 'เข้าสู่ระบบสำเร็จ' : authMode === 'browser' ? 'เข้าสู่ระบบด้วย ChatGPT' : 'เข้าสู่ระบบด้วยรหัสยืนยัน'}</h2>
        {authState === 'success' ? <p>บัญชี ChatGPT พร้อมใช้งานกับ CodexDesk แล้ว</p> : <>
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
