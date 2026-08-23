import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Brain, Check, ChevronDown, ChevronRight, CircleStop, Code2, Command, Copy, Download, ExternalLink, File, FilePenLine, Folder, FolderOpen, GitCompare, Globe2, History, Info, ListTodo, LockKeyhole, LogIn, LogOut, Monitor, Palette, Plug, Plus, Power, RefreshCw, Save, Search, Send, Server, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, SquareTerminal, Trash2, Undo2, UserRound, X } from 'lucide-react'

const api = window.codexDesk
const CHAT_COMMANDS = [
  { name: '/help', description: 'ดูคำสั่งทั้งหมด', descriptionEn: 'Show all commands' },
  { name: '/new', description: 'เริ่มแชทใหม่ในโฟลเดอร์นี้', descriptionEn: 'Start a new chat' },
  { name: '/status', description: 'ดูสถานะโปรเจกต์และ Codex', descriptionEn: 'Show project and Codex status' },
  { name: '/diff', description: 'เปิด Git Diff', descriptionEn: 'Open Git Diff' },
  { name: '/files', description: 'เปิดรายการไฟล์', descriptionEn: 'Open project files' },
  { name: '/code', description: 'เปิดตัวแก้ไขโค้ด', descriptionEn: 'Open code editor' },
  { name: '/activity', description: 'เปิดกิจกรรมแบบละเอียด', descriptionEn: 'Open detailed activity' },
  { name: '/readonly', description: 'เปลี่ยนเป็นโหมดอ่านอย่างเดียว', descriptionEn: 'Switch to read-only mode' },
  { name: '/write', description: 'อนุญาตให้แก้ไขไฟล์', descriptionEn: 'Allow file changes' },
  { name: '/approval', description: 'ตั้งค่า ask หรือ auto', descriptionEn: 'Set ask or auto approval' },
  { name: '/update', description: 'ตรวจอัปเดตแอป', descriptionEn: 'Check for app updates' },
  { name: '/copy', description: 'คัดลอกแชททั้งหมด', descriptionEn: 'Copy the full chat' },
  { name: '/undo', description: 'ย้อนกลับงานล่าสุด', descriptionEn: 'Undo the latest task' },
  { name: '/login', description: 'เปิดหน้าบัญชี ChatGPT', descriptionEn: 'Open ChatGPT account' },
  { name: '/logout', description: 'ออกจากระบบ ChatGPT', descriptionEn: 'Sign out of ChatGPT' },
  { name: '/mcp', description: 'เปิดตัวจัดการปลั๊กอิน MCP', descriptionEn: 'Open MCP plugin manager' },
  { name: '/settings', description: 'เปิดการตั้งค่า CodexDesk', descriptionEn: 'Open CodexDesk settings' },
  { name: '/search', description: 'ตั้งการค้นเว็บ cached, live หรือ off', descriptionEn: 'Set web search to cached, live, or off' },
  { name: '/personality', description: 'ตั้งบุคลิก pragmatic, friendly หรือ none', descriptionEn: 'Set pragmatic, friendly, or no personality' },
  { name: '/stop', description: 'หยุดงานและล้างคิว', descriptionEn: 'Stop the task and clear the queue' }
]

const MCP_PRESETS = [
  { name: 'github', label: 'GitHub', description: 'Repository, Issue และ Pull Request', url: 'https://api.githubcopilot.com/mcp/' },
  { name: 'canva', label: 'Canva', description: 'ค้นหาและจัดการงานออกแบบ', url: 'https://mcp.canva.com/mcp' },
  { name: 'google_drive', label: 'Google Drive', description: 'ค้นหา อ่าน และจัดการไฟล์', url: 'https://drivemcp.googleapis.com/mcp/v1' }
]

function getMcpAuthState(status, http) {
  if (!http) return { kind: 'not-required', connected: true, canConnect: false, canLogout: false }

  const value = String(status || '').toLowerCase()
  if (value === 'oauth' || value === 'authenticated' || value === 'logged_in') {
    return { kind: 'connected', connected: true, canConnect: false, canLogout: true }
  }
  if (value === 'bearer_token') {
    return { kind: 'connected', connected: true, canConnect: false, canLogout: false }
  }
  if (value === 'not_logged_in') {
    return { kind: 'not-connected', connected: false, canConnect: true, canLogout: false }
  }
  if (value === 'unsupported') {
    return { kind: 'not-required', connected: true, canConnect: false, canLogout: false }
  }
  return { kind: 'unknown', connected: false, canConnect: false, canLogout: false }
}

const DEFAULT_SETTINGS = {
  language: 'en', theme: 'black', density: 'comfortable', sendMode: 'enter', autoScroll: true,
  preventSleep: true, notifications: true, defaultAllowEdit: true, defaultApproval: 'ask',
  model: '', reasoningEffort: 'medium', personality: 'pragmatic', webSearch: 'cached',
  customInstructions: '', memoriesEnabled: false, useMemories: true,
  generateMemories: true, disableMemoriesOnExternal: true
}

function Toggle({ checked, onChange, disabled = false }) {
  return <button type="button" role="switch" aria-checked={checked} className={`settings-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} disabled={disabled}><i /></button>
}

function SettingsModal({ authenticated, currentVersion, draft, onChange, onClearData, onClose, onOpenMcp, onSave, onSignOut, onUpdate, saving, section, setSection }) {
  const l = (english, thai) => draft.language === 'th' ? thai : english
  const navigation = [
    ['general', l('General', 'ทั่วไป'), SlidersHorizontal],
    ['personal', 'Personalization', UserRound],
    ['model', l('Model & web', 'โมเดลและเว็บ'), Brain],
    ['permissions', l('Permissions', 'สิทธิ์'), LockKeyhole],
    ['integrations', l('Integrations', 'การเชื่อมต่อ'), Plug],
    ['privacy', l('Data & privacy', 'ข้อมูลและความเป็นส่วนตัว'), ShieldCheck],
    ['about', l('About', 'เกี่ยวกับ'), Info]
  ]
  const set = (key, nextValue) => onChange(current => ({ ...current, [key]: nextValue }))
  const select = (key, label, value, options) => <label className="settings-field"><span>{label}</span><select value={value} onChange={event => set(key, event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  const row = (title, detail, key, disabled = false) => <div className="settings-row"><div><strong>{title}</strong><small>{detail}</small></div><Toggle checked={Boolean(draft[key])} onChange={value => set(key, value)} disabled={disabled} /></div>

  return <motion.div className="settings-modal" initial={{ opacity: 0, scale: .98, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
    <header className="settings-heading"><div><span><SettingsIcon size={17} /></span><div><h2>{l('Settings', 'การตั้งค่า')}</h2><p>{l('CodexDesk and Codex CLI', 'CodexDesk และ Codex CLI')}</p></div></div><button onClick={onClose}><X size={16} /></button></header>
    <div className="settings-layout">
      <nav>{navigation.map(([id, label, Icon]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={14} /><span>{label}</span></button>)}</nav>
      <main className="settings-content">
        {section === 'general' && <><div className="settings-title"><Monitor size={18} /><div><h3>{l('General', 'ทั่วไป')}</h3><p>{l('Appearance and app behavior', 'หน้าตาและพฤติกรรมของแอป')}</p></div></div><div className="settings-grid">{select('language', l('App language', 'ภาษาแอป'), draft.language, [{ value: 'en', label: 'English' }, { value: 'th', label: 'ไทย' }])}{select('theme', l('Theme', 'ธีม'), draft.theme, [{ value: 'black', label: l('Pure black', 'ดำสนิท') }, { value: 'dark', label: l('Dark gray', 'เทาเข้ม') }, { value: 'system', label: l('System', 'ตามระบบ') }])}{select('density', l('Density', 'ความหนาแน่น'), draft.density, [{ value: 'comfortable', label: l('Comfortable', 'สบายตา') }, { value: 'compact', label: l('Compact', 'กะทัดรัด') }])}{select('sendMode', l('Send message', 'ปุ่มส่งข้อความ'), draft.sendMode, [{ value: 'enter', label: l('Enter to send', 'Enter เพื่อส่ง') }, { value: 'ctrl-enter', label: l('Ctrl + Enter to send', 'Ctrl + Enter เพื่อส่ง') }])}</div>{row(l('Auto-scroll chat', 'เลื่อนแชทอัตโนมัติ'), l('Follow new messages while Codex is working', 'ตามข้อความใหม่ระหว่าง Codex ทำงาน'), 'autoScroll')}{row(l('Prevent sleep while app is open', 'ป้องกันเครื่องพักระหว่างเปิดแอป'), l('Keeps long-running tasks active in the background', 'ช่วยให้งานยาวทำต่อได้ในเบื้องหลัง'), 'preventSleep')}{row(l('Notify when tasks finish', 'แจ้งเตือนเมื่องานเสร็จ'), l('Show a Windows notification when the app is not focused', 'แสดง Windows notification เมื่อแอปไม่ได้อยู่ด้านหน้า'), 'notifications')}</>}
        {section === 'personal' && <><div className="settings-title"><Palette size={18} /><div><h3>Personalization</h3><p>{l('Choose how Codex responds and remembers context', 'กำหนดวิธีที่ Codex ตอบและจดจำบริบท')}</p></div></div>{select('personality', l('Response style', 'บุคลิกการตอบ'), draft.personality, [{ value: 'pragmatic', label: l('Pragmatic and concise', 'กระชับและตรงประเด็น') }, { value: 'friendly', label: l('Friendly and explanatory', 'เป็นมิตรและอธิบายมากขึ้น') }, { value: 'none', label: l('No personality', 'ไม่กำหนดบุคลิก') }])}<label className="settings-field full"><span>{l('Custom instructions', 'คำแนะนำส่วนตัว')}</span><textarea value={draft.customInstructions} onChange={event => set('customInstructions', event.target.value)} maxLength={12000} placeholder={l('For example: use clean code and verify changes before editing', 'เช่น ตอบเป็นภาษาไทย เขียนโค้ดให้อ่านง่าย และตรวจสอบก่อนแก้ไข')} /><small>{draft.customInstructions.length.toLocaleString()} / 12,000 {l('characters', 'ตัวอักษร')}</small></label><div className="settings-subheading"><Brain size={14} />{l('Codex memories', 'ความทรงจำของ Codex')}</div>{row(l('Enable memories', 'เปิดใช้ความทรงจำ'), l('Use the Codex CLI memory system', 'ให้ Codex ใช้ระบบ memories ของ CLI'), 'memoriesEnabled')}{row(l('Use saved memories', 'ใช้ความทรงจำที่มีอยู่'), l('Apply remembered context to future tasks', 'นำสิ่งที่จำไว้มาใช้กับงานใหม่'), 'useMemories', !draft.memoriesEnabled)}{row(l('Generate new memories', 'สร้างความทรงจำใหม่'), l('Learn reusable guidance for future tasks', 'เรียนรู้คำแนะนำที่เป็นประโยชน์สำหรับงานถัดไป'), 'generateMemories', !draft.memoriesEnabled)}{row(l('Disable with external context', 'ปิดเมื่อมีบริบทภายนอก'), l('Reduce context mixing when external tools are connected', 'ลดการผสมข้อมูลเมื่อเชื่อมเครื่องมือภายนอก'), 'disableMemoriesOnExternal', !draft.memoriesEnabled)}</>}
        {section === 'model' && <><div className="settings-title"><Brain size={18} /><div><h3>{l('Model & web search', 'โมเดลและการค้นเว็บ')}</h3><p>{l('Defaults used by Codex CLI for new tasks', 'ค่าหลักที่ Codex CLI ใช้กับทุกแชทใหม่')}</p></div></div>{select('model', l('Model', 'โมเดล'), draft.model, [{ value: '', label: l('Account default', 'ค่าเริ่มต้นของบัญชี') }, { value: 'gpt-5.6-sol', label: l('GPT-5.6 Sol — most capable', 'GPT-5.6 Sol — ฉลาดที่สุด') }, { value: 'gpt-5.6-terra', label: l('GPT-5.6 Terra — balanced', 'GPT-5.6 Terra — สมดุล') }, { value: 'gpt-5.6-luna', label: l('GPT-5.6 Luna — fast and efficient', 'GPT-5.6 Luna — เร็วและประหยัด') }, { value: 'gpt-5.5', label: l('GPT-5.5 — previous generation', 'GPT-5.5 — รุ่นก่อนหน้า') }])}<div className="settings-subheading"><Brain size={14} />{l('Reasoning effort', 'ระดับการคิด')}</div><div className="reasoning-picker">{[{ value: 'low', label: 'Low', detail: l('Fast, lower usage', 'เร็วและใช้น้อย') }, { value: 'medium', label: 'Medium', detail: l('Balanced, recommended', 'สมดุล แนะนำ') }, { value: 'high', label: 'High', detail: l('More thorough', 'คิดละเอียดขึ้น') }, { value: 'xhigh', label: 'Extra high', detail: l('Most complex tasks', 'งานซับซ้อนที่สุด') }].map(option => <button key={option.value} className={draft.reasoningEffort === option.value ? 'active' : ''} onClick={() => set('reasoningEffort', option.value)}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div><p className="usage-hint">{l('Higher levels usually take longer and use more quota. Actual usage depends on the model, task, and ChatGPT plan.', 'ระดับที่สูงขึ้นมักใช้เวลานานและใช้โควตามากขึ้น จำนวนจริงขึ้นอยู่กับโมเดล งาน และแผน ChatGPT ของคุณ')}</p>{select('webSearch', l('Web search', 'การค้นเว็บ'), draft.webSearch, [{ value: 'cached', label: l('Cached — safer default', 'Cached ปลอดภัยกว่า') }, { value: 'live', label: l('Live — latest information', 'Live ข้อมูลล่าสุด') }, { value: 'disabled', label: l('Disabled', 'ปิด') }])}<div className="settings-callout"><Globe2 size={15} /><div><strong>{l('Codex can search the web', 'Codex ค้นเว็บได้จริง')}</strong><p>{l('Cached uses OpenAI’s search index. Live fetches current pages. Web content can be untrusted, so verify sources.', 'Cached ใช้ดัชนีของ OpenAI ส่วน Live เปิดหน้าเว็บล่าสุด การค้นเว็บอาจพบเนื้อหาที่ไม่น่าเชื่อถือ ควรตรวจแหล่งอ้างอิงเสมอ')}</p></div></div></>}
        {section === 'permissions' && <><div className="settings-title"><LockKeyhole size={18} /><div><h3>{l('Default permissions', 'สิทธิ์เริ่มต้น')}</h3><p>{l('Applied the next time the app starts', 'ใช้เมื่อเริ่มแอปครั้งถัดไป')}</p></div></div>{row(l('Allow file edits', 'อนุญาตแก้ไขไฟล์'), l('Codex can read, create, edit, and run tools in the project', 'Codex อ่าน สร้าง แก้ไข และรันเครื่องมือในโปรเจกต์ได้'), 'defaultAllowEdit')}<div className="settings-grid">{select('defaultApproval', l('Confirmation before tasks', 'การยืนยันก่อนเริ่มงาน'), draft.defaultApproval, [{ value: 'ask', label: l('Ask every time', 'ถามทุกครั้ง') }, { value: 'auto', label: l('Automatic', 'ทำอัตโนมัติ') }])}</div><div className="settings-callout"><ShieldCheck size={15} /><div><strong>{l('Permissions apply to local work', 'สิทธิ์มีผลกับงานในเครื่อง')}</strong><p>{l('Ask mode confirms before file-changing tasks. Risky commands remain subject to Codex and operating-system policy.', 'โหมดถามก่อนจะขออนุญาตก่อนเริ่มงานที่แก้ไฟล์ ส่วนคำสั่งเสี่ยงยังขึ้นอยู่กับนโยบายของ Codex และระบบปฏิบัติการ')}</p></div></div></>}
        {section === 'integrations' && <><div className="settings-title"><Plug size={18} /><div><h3>{l('Integrations', 'การเชื่อมต่อ')}</h3><p>{l('ChatGPT account and MCP tools', 'บัญชี ChatGPT และเครื่องมือ MCP')}</p></div></div><div className="settings-account"><span className={authenticated ? 'ready' : ''}>{authenticated ? <Check size={16} /> : <LogIn size={16} />}</span><div><strong>{authenticated ? l('ChatGPT connected', 'เชื่อมต่อ ChatGPT แล้ว') : l('ChatGPT not connected', 'ยังไม่ได้เชื่อมต่อ ChatGPT')}</strong><small>{l('Codex CLI uses this account to process tasks', 'Codex CLI ใช้บัญชีนี้เพื่อประมวลผลงาน')}</small></div>{authenticated && <button onClick={onSignOut}>{l('Sign out', 'ออกจากระบบ')}</button>}</div><button className="settings-wide-action" onClick={onOpenMcp}><Plug size={14} /><div><strong>{l('Manage MCP plugins', 'จัดการปลั๊กอิน MCP')}</strong><small>{l('GitHub, Canva, Google Drive, and your own servers', 'GitHub, Canva, Google Drive และเซิร์ฟเวอร์ของคุณ')}</small></div><ChevronRight size={15} /></button></>}
        {section === 'privacy' && <><div className="settings-title"><ShieldCheck size={18} /><div><h3>{l('Data & privacy', 'ข้อมูลและความเป็นส่วนตัว')}</h3><p>{l('Understand how your data is stored and used', 'ดูว่าข้อมูลถูกเก็บและใช้งานอย่างไร')}</p></div></div><div className="privacy-card"><strong>{l('Data in CodexDesk', 'ข้อมูลใน CodexDesk')}</strong><p>{l('Chat history and undo snapshots are stored on this device. Prompts and context used by Codex are sent to OpenAI through Codex CLI under your account type and workspace policy.', 'ประวัติแชทและจุดย้อนกลับเก็บไว้ในเครื่องนี้ ส่วนข้อความและบริบทที่ Codex ใช้จะถูกส่งผ่าน Codex CLI ไปยัง OpenAI ตามประเภทบัญชีและนโยบายของพื้นที่ทำงาน')}</p></div><button className="settings-wide-action" onClick={() => api.openLink('https://openai.com/policies/privacy-policy/')}><ExternalLink size={14} /><div><strong>{l('OpenAI Privacy Policy', 'นโยบายความเป็นส่วนตัวของ OpenAI')}</strong><small>{l('Read the official privacy policy', 'อ่าน Privacy Policy ฉบับทางการ')}</small></div><ChevronRight size={15} /></button><button className="settings-wide-action" onClick={() => api.openLink('https://learn.chatgpt.com/api/docs/guides/your-data')}><ExternalLink size={14} /><div><strong>{l('Data controls', 'ข้อมูลและการควบคุมข้อมูล')}</strong><small>{l('Learn how ChatGPT and API data is managed', 'อ่านวิธีจัดการข้อมูลของ ChatGPT และ API')}</small></div><ChevronRight size={15} /></button><button className="settings-wide-action" onClick={() => api.openLink('https://learn.chatgpt.com/docs/auth')}><ExternalLink size={14} /><div><strong>{l('Codex authentication', 'การเข้าสู่ระบบ Codex')}</strong><small>{l('Sign-in method affects data policy', 'ประเภทการเข้าสู่ระบบมีผลต่อนโยบายข้อมูล')}</small></div><ChevronRight size={15} /></button><button className="danger-action" onClick={onClearData}><Trash2 size={14} />{l('Delete all local chat and undo history', 'ลบประวัติแชทและจุดย้อนกลับทั้งหมดในเครื่อง')}</button></>}
        {section === 'about' && <><div className="settings-title"><Info size={18} /><div><h3>{l('About CodexDesk', 'เกี่ยวกับ CodexDesk')}</h3><p>{l('Desktop workspace for OpenAI Codex CLI on Windows', 'เดสก์ท็อปสำหรับ OpenAI Codex CLI บน Windows')}</p></div></div><div className="about-mark"><Code2 size={22} /><div><strong>CodexDesk</strong><small>{l('Version', 'เวอร์ชัน')} {currentVersion || l('Checking', 'กำลังตรวจสอบ')}</small></div></div><button className="settings-wide-action" onClick={onUpdate}><RefreshCw size={14} /><div><strong>{l('Check for updates', 'ตรวจสอบอัปเดต')}</strong><small>{l('Downloads and installs only after you confirm', 'ดาวน์โหลดและติดตั้งเมื่อคุณยืนยันเท่านั้น')}</small></div><ChevronRight size={15} /></button><button className="settings-wide-action" onClick={() => api.openLink('https://developers.openai.com/codex/cli')}><ExternalLink size={14} /><div><strong>{l('Codex CLI guide', 'คู่มือ Codex CLI')}</strong><small>{l('Official OpenAI documentation', 'เอกสารทางการจาก OpenAI')}</small></div><ChevronRight size={15} /></button></>}
      </main>
    </div>
    <footer className="settings-footer"><span>{saving ? l('Saving...', 'กำลังบันทึก...') : l('Codex settings apply to the next task', 'การตั้งค่าจะใช้กับงานถัดไป')}</span><div><button onClick={onClose}>{l('Cancel', 'ยกเลิก')}</button><button className="primary" onClick={onSave} disabled={saving}>{saving ? l('Saving', 'กำลังบันทึก') : l('Save settings', 'บันทึกการตั้งค่า')}</button></div></footer>
  </motion.div>
}

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

function filterFileTree(nodes, input) {
  const query = input.trim().toLowerCase()
  if (!query) return nodes
  return nodes.flatMap(node => {
    if (!node.directory) return node.name.toLowerCase().includes(query) ? [node] : []
    if (node.name.toLowerCase().includes(query)) return [node]
    const children = filterFileTree(node.children || [], query)
    return children.length > 0 ? [{ ...node, children }] : []
  })
}

function App() {
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [fileQuery, setFileQuery] = useState('')
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
  const [updateOpen, setUpdateOpen] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('')
  const [queue, setQueue] = useState([])
  const [activity, setActivity] = useState([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [mobileView, setMobileView] = useState('chat')
  const [sessionId, setSessionId] = useState(null)
  const [historyReady, setHistoryReady] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [mcpServers, setMcpServers] = useState([])
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpError, setMcpError] = useState('')
  const [mcpOutput, setMcpOutput] = useState('')
  const [mcpFormOpen, setMcpFormOpen] = useState(false)
  const [mcpForm, setMcpForm] = useState({ name: '', transport: 'http', url: '', command: '', arguments: '' })
  const [undoStack, setUndoStack] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('general')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const codexBuffer = useRef('')
  const conversationEnd = useRef(null)
  const runningRef = useRef(false)
  const queueRef = useRef([])
  const leftCtrlPressed = useRef(false)
  const sessionIdRef = useRef(null)
  const workspacePromise = useRef(null)

  const t = (english, thai) => settings.language === 'th' ? thai : english
  const dirty = currentFile && content !== savedContent
  const commandSuggestions = prompt.startsWith('/') && !prompt.includes('\n') ? CHAT_COMMANDS.filter(command => command.name.startsWith(prompt.split(/\s+/)[0].toLowerCase())).slice(0, 7) : []
  const liveActivity = activity.slice().reverse().find(item => item.status === 'running') || activity.at(-1)
  const currentTaskIndex = activity.map(item => item.type).lastIndexOf('task')
  const currentTaskActivity = currentTaskIndex >= 0 ? activity.slice(currentTaskIndex) : activity
  const liveStats = currentTaskActivity.reduce((total, item) => ({ additions: total.additions + (item.additions || 0), deletions: total.deletions + (item.deletions || 0) }), { additions: 0, deletions: 0 })
  const visibleFiles = useMemo(() => filterFileTree(files, fileQuery), [files, fileQuery])

  useEffect(() => {
    api.getVersion().then(setCurrentVersion)
    api.getProject().then(value => value && loadProject(value))
    api.settingsGet().then(value => {
      setSettings(value)
      setSettingsDraft(value)
      setAllowEdit(value.defaultAllowEdit)
      setApprovalMode(value.defaultApproval)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!project) return undefined
    let refreshing = false
    let pending = false
    const update = async () => {
      if (refreshing) {
        pending = true
        return
      }
      refreshing = true
      try {
        setFiles(await api.listFiles())
      } finally {
        refreshing = false
        if (pending) {
          pending = false
          void update()
        }
      }
    }
    return api.onFilesChanged(update)
  }, [project?.path])

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

  useEffect(() => api.onMcpEvent(event => {
    if (event.type === 'output') setMcpOutput(value => (value + event.data).slice(-4000))
  }), [])

  useEffect(() => {
    api.updateState().then(setUpdater)
    return api.onUpdateEvent(setUpdater)
  }, [])

  useEffect(() => {
    if (!settings.autoScroll) return
    conversationEnd.current?.scrollIntoView({ behavior: running ? 'smooth' : 'auto', block: 'end' })
  }, [events, running, settings.autoScroll])

  useEffect(() => {
    if (!project || !historyReady) return undefined
    const timeout = window.setTimeout(() => {
      api.historySave({ conversationId, events, sessionId }).then(saved => {
        setConversationId(saved.conversationId)
        return api.historyList()
      }).then(setConversations).catch(() => {})
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [events, sessionId, conversationId, project, historyReady])

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

  async function openMcp() {
    setMcpOpen(true)
    setMcpError('')
    setMcpBusy(true)
    try {
      setMcpServers(await api.mcpList())
    } catch (error) {
      setMcpError(error.message)
    } finally {
      setMcpBusy(false)
    }
  }

  async function runMcpAction(action) {
    if (mcpBusy || running) return false
    setMcpBusy(true)
    setMcpError('')
    setMcpOutput('')
    try {
      setMcpServers(await action())
      return true
    } catch (error) {
      setMcpError(error.message)
      return false
    } finally {
      setMcpBusy(false)
    }
  }

  function installPreset(preset) {
    return runMcpAction(() => api.mcpAdd({ name: preset.name, transport: 'http', url: preset.url }))
  }

  async function installMcp() {
    const payload = mcpForm.transport === 'http'
      ? { name: mcpForm.name, transport: 'http', url: mcpForm.url }
      : { name: mcpForm.name, transport: 'stdio', command: mcpForm.command, args: mcpForm.arguments.split(/\r?\n/).map(value => value.trim()).filter(Boolean) }
    const installed = await runMcpAction(() => api.mcpAdd(payload))
    if (!installed) return
    setMcpFormOpen(false)
    setMcpForm({ name: '', transport: 'http', url: '', command: '', arguments: '' })
  }

  function openUpdate() {
    setUpdateOpen(true)
    if (['idle', 'current', 'error'].includes(updater.status)) void api.updateCheck()
  }

  function openSettings(section = 'general') {
    setSettingsDraft({ ...settings })
    setSettingsSection(section)
    setSettingsOpen(true)
  }

  async function saveSettings() {
    if (settingsSaving) return
    setSettingsSaving(true)
    try {
      const saved = await api.settingsSave(settingsDraft)
      setSettings(saved)
      setSettingsDraft(saved)
      setAllowEdit(saved.defaultAllowEdit)
      setApprovalMode(saved.defaultApproval)
      setSettingsOpen(false)
      addSystemMessage('บันทึกการตั้งค่าแล้ว ค่าของ Codex จะใช้กับงานถัดไป')
    } catch (error) {
      alert(`บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`)
    } finally {
      setSettingsSaving(false)
    }
  }

  async function applySettingPatch(patch) {
    const saved = await api.settingsSave({ ...settings, ...patch })
    setSettings(saved)
    setSettingsDraft(saved)
    return saved
  }

  async function clearLocalData() {
    if (!confirm('ลบประวัติแชทและจุดย้อนกลับทั้งหมดในเครื่องหรือไม่ การกระทำนี้ย้อนกลับไม่ได้')) return
    try {
      await api.settingsClearLocalData()
      setUndoStack([])
      setHistoryReady(false)
      if (project) {
        const history = await api.historyGet()
        applyConversation(history)
        setConversations(await api.historyList())
      }
      setHistoryReady(true)
      alert('ลบข้อมูลในเครื่องแล้ว')
    } catch (error) {
      alert(error.message)
    }
  }

  async function uninstallApp() {
    if (!confirm('ถอนการติดตั้ง CodexDesk หรือไม่ ประวัติแชทและการตั้งค่าจะยังถูกเก็บไว้')) return
    try {
      await api.appUninstall()
    } catch (error) {
      alert(error.message)
    }
  }

  const updateLabel = ({
    checking: t('Checking...', 'กำลังตรวจ...'),
    available: t(`Download ${updater.version || ''}`, `ดาวน์โหลด ${updater.version || ''}`),
    downloading: t(`Downloading ${updater.percent}%`, `กำลังดาวน์โหลด ${updater.percent}%`),
    downloaded: t('Install update', 'ติดตั้งอัปเดต'),
    error: t('Check again', 'ตรวจใหม่')
  })[updater.status] || t('Check updates', 'ตรวจอัปเดต')

  const authUrl = authOutput.match(/https:\/\/(?:auth\.openai\.com|chatgpt\.com)\/[A-Za-z0-9/_?=&.%-]+/)?.[0]
  const deviceCode = authOutput.match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0]

  async function loadProject(value) {
    setHistoryReady(false)
    setProject(value)
    setEvents([])
    const [nextFiles, history, undoHistory] = await Promise.all([api.listFiles(), api.historyGet(), api.undoList()])
    const historyList = await api.historyList()
    setFiles(nextFiles)
    setUndoStack(undoHistory)
    setConversationId(history.conversationId)
    setConversations(historyList)
    sessionIdRef.current = history.sessionId || null
    setSessionId(history.sessionId || null)
    setEvents((history.events || []).map(event => ({ ...event, queued: false })))
    setHistoryReady(true)
  }

  async function openProject() {
    if (project && historyReady) await api.historySave({ conversationId, events, sessionId }).catch(() => {})
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

  async function ensureWorkspace() {
    if (project) return project
    if (!workspacePromise.current) {
      workspacePromise.current = api.createWorkspace().then(async value => {
        await loadProject(value)
        return value
      }).finally(() => { workspacePromise.current = null })
    }
    return workspacePromise.current
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

  async function sendPrompt() {
    const text = prompt.trim()
    if (!text) return
    if (text.startsWith('/')) {
      setPrompt('')
      void runChatCommand(text)
      return
    }
    if (!project) {
      try {
        await ensureWorkspace()
      } catch (error) {
        addSystemMessage(`สร้าง Workspace ไม่สำเร็จ: ${error.message}`)
        return
      }
    }
    if (allowEdit && approvalMode === 'ask' && !confirm('อนุญาตให้ Codex แก้ไขไฟล์ รันคำสั่ง และใช้ปลั๊กอิน MCP สำหรับงานนี้หรือไม่')) return
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
    if (command === '/new') {
      await newChat()
      return
    }
    if (command === '/clear') {
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
      openUpdate()
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
    if (command === '/mcp') {
      await openMcp()
      return
    }
    if (command === '/settings') {
      openSettings()
      return
    }
    if (command === '/search') {
      const mode = args[0]?.toLowerCase()
      const value = mode === 'off' ? 'disabled' : mode
      if (!['cached', 'live', 'disabled'].includes(value)) {
        addSystemMessage('ใช้ `/search cached`, `/search live` หรือ `/search off`')
        return
      }
      await applySettingPatch({ webSearch: value })
      addSystemMessage(value === 'live' ? 'เปิดค้นเว็บแบบข้อมูลล่าสุดแล้ว' : value === 'cached' ? 'เปิดค้นเว็บผ่านดัชนีของ OpenAI แล้ว' : 'ปิดการค้นเว็บแล้ว')
      return
    }
    if (command === '/personality') {
      const value = args[0]?.toLowerCase()
      if (!['pragmatic', 'friendly', 'none'].includes(value)) {
        addSystemMessage('ใช้ `/personality pragmatic`, `/personality friendly` หรือ `/personality none`')
        return
      }
      await applySettingPatch({ personality: value })
      addSystemMessage(`ตั้งบุคลิกเป็น **${value}** แล้ว`)
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

  function applyConversation(history) {
    sessionIdRef.current = history.sessionId || null
    setSessionId(history.sessionId || null)
    setConversationId(history.conversationId)
    setEvents((history.events || []).map(event => ({ ...event, queued: false })))
    setActivity([])
  }

  async function newChat() {
    if (running || !project) return
    setHistoryReady(false)
    await api.historySave({ conversationId, events, sessionId }).catch(() => {})
    const history = await api.historyNew()
    applyConversation(history)
    setConversations(await api.historyList())
    setHistoryOpen(false)
    setHistoryReady(true)
  }

  async function openConversation(id) {
    if (running || id === conversationId) return
    setHistoryReady(false)
    await api.historySave({ conversationId, events, sessionId }).catch(() => {})
    const history = await api.historyOpen(id)
    applyConversation(history)
    setConversations(await api.historyList())
    setHistoryOpen(false)
    setHistoryReady(true)
  }

  async function clearHistory() {
    if (running || !confirm('ลบแชทนี้หรือไม่')) return
    setHistoryReady(false)
    const history = await api.historyClear(conversationId)
    applyConversation(history)
    setConversations(await api.historyList())
    setHistoryReady(true)
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

  return <div className={`app-shell theme-${settings.theme} density-${settings.density}`}>
    <header className="titlebar">
      <div className="brand"><div className="brand-mark"><Code2 size={15} /></div><div className="brand-copy"><span>CodexDesk</span><small>AI CODE WORKSPACE</small></div></div>
      <button className="project-switcher" onClick={openProject}><FolderOpen size={15} /><span>{project?.name || t('Open project', 'เปิดโปรเจกต์')}</span><ChevronDown size={13} /></button>
      <div className="title-actions">
        <button className={`update-button ${updater.status}`} onClick={openUpdate}>{updater.status === 'downloaded' || updater.status === 'available' ? <Download size={13} /> : <RefreshCw size={13} />}<span>{updateLabel}</span></button>
        <button className={`account-button ${authenticated ? 'connected' : ''}`} onClick={openAccount}>{authenticated ? <Check size={13} /> : <LogIn size={13} />}<span>{authenticated ? t('Connected', 'เชื่อมต่อแล้ว') : t('Connect ChatGPT', 'เชื่อมต่อ ChatGPT')}</span></button>
        <span className={`status-dot ${running ? 'active' : ''}`} /><span>{running ? t('Working', 'กำลังทำงาน') : t('Ready', 'พร้อมใช้งาน')}</span>
      </div>
    </header>

    <main className={`workspace view-${mobileView}`}>
      <aside className="rail">
        <button className={`rail-button ${mobileView === 'files' ? 'active' : ''}`} onClick={() => setMobileView('files')} title={t('Files', 'ไฟล์')}><FolderOpen size={17} /><span>{t('Files', 'ไฟล์')}</span></button>
        <button className={`rail-button ${mobileView === 'editor' ? 'active' : ''}`} onClick={() => setMobileView('editor')} title={t('Code editor', 'ตัวแก้ไขโค้ด')}><Code2 size={17} /><span>{t('Code', 'โค้ด')}</span></button>
        <button className={`rail-button ${mobileView === 'chat' ? 'active' : ''}`} onClick={() => setMobileView('chat')} title="Codex"><Bot size={17} /><span>Codex</span></button>
        <button className="rail-button" onClick={() => { setMobileView('editor'); loadDiff() }} title="Git Diff"><GitCompare size={17} /><span>Diff</span></button>
        <button className="rail-button" onClick={openMcp} title={t('MCP plugins', 'ปลั๊กอิน MCP')}><Plug size={17} /><span>{t('Plugins', 'ปลั๊กอิน')}</span></button>
        <div className="rail-spacer" />
        <button className="rail-button" onClick={() => openSettings()} title={t('Settings', 'การตั้งค่า')}><SettingsIcon size={17} /><span>{t('Settings', 'ตั้งค่า')}</span></button>
        <button className={`rail-button ${authenticated ? 'signed-in' : ''}`} onClick={openAccount} title={authenticated ? t('ChatGPT account', 'บัญชี ChatGPT') : t('Sign in to ChatGPT', 'เข้าสู่ระบบ ChatGPT')}>{authenticated ? <Check size={17} /> : <LogIn size={17} />}<span>{t('Account', 'บัญชี')}</span></button>
      </aside>

      <aside className="explorer">
        <div className="panel-heading"><div><span>PROJECT FILES</span><small>{project ? 'LOCAL' : 'EMPTY'}</small></div><button onClick={refreshFiles}><RefreshCw size={14} /></button></div>
        <div className="project-label"><FolderOpen size={13} /><span>{project?.name || t('No project open', 'ยังไม่ได้เปิดโปรเจกต์')}</span></div>
        <label className="file-search"><Search size={13} /><input value={fileQuery} onChange={event => setFileQuery(event.target.value)} placeholder={t('Search files', 'ค้นหาไฟล์')} /></label>
        <div className="file-tree">{visibleFiles.map(node => <FileNode key={node.path} node={node} onOpen={openFile} />)}{visibleFiles.length === 0 && fileQuery && <div className="file-empty">{t('No files found', 'ไม่พบไฟล์')}</div>}</div>
      </aside>

      <section className="editor-area">
        <div className="editor-tabs">
          {currentFile ? <div className="editor-tab active"><File size={13} /><span>{project?.name}</span><ChevronRight size={11} /><strong>{currentFile.name}</strong>{dirty && <i />}</div> : <div className="empty-tab"><Code2 size={13} />{t('Code editor', 'พื้นที่แก้ไขโค้ด')}</div>}
          <button className="save-button" disabled={!dirty} onClick={saveFile}><Save size={14} />{t('Save', 'บันทึก')}</button>
        </div>
        <div className="editor-wrap">
          <Editor value={content} onChange={value => setContent(value ?? '')} language={language} theme="vs-dark" options={{ minimap: { enabled: true }, fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 14, padding: { top: 16 }, smoothScrolling: true, cursorSmoothCaretAnimation: 'on', renderLineHighlight: 'all', wordWrap: 'off', automaticLayout: true }} />
        </div>
        <div className="bottom-panel">
          <div className="diff-heading"><GitCompare size={14} /><span>Git Diff</span><button onClick={loadDiff}><RefreshCw size={13} />{t('Refresh', 'รีเฟรช')}</button></div>
          <pre className="diff-view">{diff || t('Codex changes will appear here', 'การเปลี่ยนแปลงของ Codex จะแสดงที่นี่')}</pre>
        </div>
        <div className="editor-status"><span>{currentFile ? language.toUpperCase() : 'NO FILE'}</span><span>{dirty ? t('Unsaved', 'ยังไม่ได้บันทึก') : t('Saved', 'บันทึกแล้ว')}</span><span>UTF-8</span></div>
      </section>

      <aside className="agent-panel">
        <div className="agent-heading"><div><Bot size={17} /><span>Codex</span></div><div className="agent-actions"><button className="icon-action" disabled={running} onClick={newChat} title={t('New chat', 'แชทใหม่')}><Plus size={14} /></button><button className={`icon-action ${historyOpen ? 'active' : ''}`} onClick={() => { setHistoryOpen(value => !value); setActivityOpen(false) }} title={t('Chat history', 'ประวัติแชท')}><History size={14} /></button><button className="icon-action" disabled={events.length === 0} onClick={copyChat} title={t('Copy full chat', 'คัดลอกแชททั้งหมด')}><Copy size={14} /></button><button className="icon-action" disabled={running || undoStack.length === 0} onClick={undoLastTask} title={t('Undo latest task', 'ย้อนกลับงานล่าสุด')}><Undo2 size={14} /></button><button className={activityOpen ? 'active' : ''} onClick={() => { setActivityOpen(value => !value); setHistoryOpen(false) }} title="Left Ctrl + O"><ListTodo size={15} />{t('Activity', 'กิจกรรม')}{queue.length > 0 && <b>{queue.length}</b>}</button><button disabled={!running} onClick={stopCodex}><CircleStop size={15} />{t('Stop', 'หยุด')}</button></div></div>
        <div className="agent-meta"><span>Local workspace</span><span>{allowEdit ? 'Workspace write' : 'Read only'}</span></div>
        <div className="conversation">
          {events.length === 0 && <div className="welcome"><span className="welcome-kicker">CODEX WORKSPACE</span><div className="welcome-icon"><Bot size={22} /></div><h2>{t('What would you like to build?', 'วันนี้ต้องการสร้างอะไร')}</h2><p>{t('Ask Codex to create, inspect, or edit code. No folder is required.', 'สั่งให้ Codex สร้าง อ่าน ตรวจสอบ หรือแก้ไขงานได้โดยไม่ต้องเปิดโฟลเดอร์')}</p><div className="welcome-actions"><button onClick={() => setPrompt(t('Inspect this project and summarize improvements', 'ตรวจสอบโครงสร้างโปรเจกต์และสรุปสิ่งที่ควรปรับปรุง'))}><Search size={13} /><span>{t('Inspect project', 'ตรวจโปรเจกต์')}</span></button><button onClick={() => setPrompt(t('Find potential bugs and fix them safely', 'ค้นหาบัคที่อาจเกิดขึ้นและแก้ไขให้ปลอดภัย'))}><ShieldCheck size={13} /><span>{t('Find bugs', 'ค้นหาบัค')}</span></button><button onClick={() => setPrompt(t('Create a new project for me. Ask only for essential requirements.', 'สร้างโปรเจกต์ใหม่ให้ฉัน ถามเฉพาะข้อมูลที่จำเป็น'))}><Code2 size={13} /><span>{t('New project', 'สร้างโปรเจกต์')}</span></button></div></div>}
          {events.map((event, index) => <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} key={event.id || index} className={`message ${event.kind} ${event.queued ? 'queued' : ''}`}><div className="message-label"><span>{event.kind === 'user' ? event.queued ? t('You · queued', 'คุณ · อยู่ในคิว') : t('You', 'คุณ') : event.kind === 'system' ? t('System', 'ระบบ') : 'Codex'}</span><button onClick={() => api.copyText(event.text)} title={t('Copy message', 'คัดลอกข้อความ')}><Copy size={11} /></button></div><div className="markdown"><MarkdownMessage text={event.text} /></div></motion.div>)}
          {running && <div className="thinking"><i /><i /><i /></div>}
          <div ref={conversationEnd} className="conversation-end" />
        </div>
        {running && <div className="live-status"><div><i /><span>{liveActivity?.title || t('Starting task', 'กำลังเริ่มงาน')}</span></div>{(liveStats.additions > 0 || liveStats.deletions > 0) && <strong><b>+{liveStats.additions}</b><em>-{liveStats.deletions}</em></strong>}</div>}
        <AnimatePresence>{historyOpen && <motion.div className="activity-drawer history-drawer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
          <div className="activity-heading"><div><History size={15} /><span>{t('Chat history', 'ประวัติแชท')}</span></div><button className="new-chat-button" onClick={newChat} disabled={running}><Plus size={13} />{t('New chat', 'แชทใหม่')}</button></div>
          <div className="history-list">{conversations.map(item => <button className={item.conversationId === conversationId ? 'active' : ''} key={item.conversationId} onClick={() => openConversation(item.conversationId)} disabled={running}><span>{item.title}</span><time>{new Date(item.updatedAt).toLocaleString(settings.language === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</time></button>)}</div>
        </motion.div>}</AnimatePresence>
        <AnimatePresence>{activityOpen && <motion.div className="activity-drawer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
          <div className="activity-heading"><div><ListTodo size={15} /><span>{t('Codex activity', 'กิจกรรมของ Codex')}</span></div><div className="activity-heading-actions"><kbd>Ctrl + O</kbd><button onClick={clearHistory} title={t('Clear chat', 'ล้างประวัติแชท')}><Trash2 size={13} /></button></div></div>
          {queue.length > 0 && <div className="queue-section"><strong>{t('Message queue', 'คิวข้อความ')} {queue.length}</strong>{queue.map((task, index) => <div className="queue-item" key={task.id}><span>{index + 1}</span><p>{task.text}</p></div>)}</div>}
          <div className="activity-list">{activity.length === 0 ? <div className="activity-empty">{t('No activity yet', 'ยังไม่มีกิจกรรม')}</div> : activity.slice().reverse().map(item => <div className={`activity-item ${item.status}`} key={item.id}><i /><div><div className="activity-title"><strong>{item.title}</strong>{(item.additions > 0 || item.deletions > 0) && <span><b>+{item.additions}</b><em>-{item.deletions}</em></span>}</div>{item.changes?.length > 0 && <div className="file-change-list">{item.changes.map((change, index) => <div className="file-change-row" key={`${change.path}-${index}`}><FilePenLine size={12} /><span>{change.path}</span><b>+{change.additions}</b><em>-{change.deletions}</em></div>)}</div>}{item.output && <pre>{item.output}</pre>}</div></div>)}</div>
        </motion.div>}</AnimatePresence>
        <div className="composer">
          {commandSuggestions.length > 0 && <div className="command-menu"><div className="command-menu-label"><Command size={12} />{t('Commands', 'คำสั่ง')}</div>{commandSuggestions.map(command => <button key={command.name} onClick={() => setPrompt(command.name === '/approval' ? '/approval ' : command.name)}><code>{command.name}</code><span>{settings.language === 'th' ? command.description : command.descriptionEn}</span></button>)}</div>}
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { const send = settings.sendMode === 'ctrl-enter' ? event.key === 'Enter' && event.ctrlKey : event.key === 'Enter' && !event.shiftKey; if (send) { event.preventDefault(); void sendPrompt() } }} placeholder={project ? t('Ask Codex…', 'สั่งงาน Codex…') : t('Ask Codex to create something new…', 'สั่งให้ Codex สร้างงานใหม่…')} />
          {queue.length > 0 && <div className="queue-indicator">{t(`${queue.length} message${queue.length === 1 ? '' : 's'} waiting`, `มี ${queue.length} ข้อความรอทำงาน`)}</div>}
          <div className="composer-footer">
            <div className="composer-options">
              <button className="permission" onClick={() => setAllowEdit(value => !value)}><span className={allowEdit ? 'enabled' : ''} />{allowEdit ? t('Workspace write', 'แก้ไขไฟล์ได้') : t('Read only', 'อ่านอย่างเดียว')}</button>
              <button className="approval-mode" onClick={() => setApprovalMode(value => value === 'ask' ? 'auto' : 'ask')} title={t('Approval mode', 'รูปแบบการอนุมัติ')}><ShieldCheck size={13} />{approvalMode === 'ask' ? t('Ask first', 'ถามก่อน') : t('Automatic', 'อัตโนมัติ')}</button>
              <button className="model-chip" onClick={() => openSettings('model')} title={t('Choose model and reasoning', 'เลือกโมเดลและระดับการคิด')}><Brain size={13} />{settings.model ? settings.model.replace('gpt-', '') : 'Auto'} · {settings.reasoningEffort}</button>
            </div>
            <button className="send-button" onClick={() => void sendPrompt()} disabled={!prompt.trim()}><Send size={15} /></button>
          </div>
        </div>
      </aside>
    </main>
    <AnimatePresence>{settingsOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <SettingsModal authenticated={authenticated} currentVersion={currentVersion} draft={settingsDraft} onChange={setSettingsDraft} onClearData={clearLocalData} onClose={() => setSettingsOpen(false)} onOpenMcp={() => { setSettingsOpen(false); void openMcp() }} onSave={saveSettings} onSignOut={signOut} onUpdate={() => { setSettingsOpen(false); openUpdate() }} saving={settingsSaving} section={settingsSection} setSection={setSettingsSection} />
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{mcpOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="mcp-modal" initial={{ opacity: 0, scale: .97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <div className="mcp-heading"><div><span className="mcp-symbol"><Plug size={17} /></span><div><h2>{t('MCP plugins', 'ปลั๊กอิน MCP')}</h2><p>{t('Connect external tools to Codex', 'เชื่อมเครื่องมือภายนอกเข้ากับ Codex')}</p></div></div><div><button className="mcp-add" onClick={() => setMcpFormOpen(value => !value)}><Plus size={13} />{t('Add custom', 'เพิ่มเอง')}</button><button className="modal-close static" onClick={() => setMcpOpen(false)}><X size={16} /></button></div></div>
        <div className="mcp-content">
          <section className="mcp-presets"><span className="mcp-section-label">{t('Quick install', 'ติดตั้งด่วน')}</span><div>{MCP_PRESETS.map(preset => { const installed = mcpServers.some(server => server.name === preset.name); return <button key={preset.name} disabled={installed || mcpBusy || running} onClick={() => installPreset(preset)}><span><Server size={15} /></span><div><strong>{preset.label}</strong><small>{preset.description}</small></div><i>{installed ? t('Installed', 'ติดตั้งแล้ว') : t('Install', 'ติดตั้ง')}</i></button> })}</div></section>
          <AnimatePresence>{mcpFormOpen && <motion.section className="mcp-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="mcp-form-tabs"><button className={mcpForm.transport === 'http' ? 'active' : ''} onClick={() => setMcpForm(value => ({ ...value, transport: 'http' }))}><Globe2 size={12} />HTTP</button><button className={mcpForm.transport === 'stdio' ? 'active' : ''} onClick={() => setMcpForm(value => ({ ...value, transport: 'stdio' }))}><SquareTerminal size={12} />STDIO</button></div>
            <input value={mcpForm.name} onChange={event => setMcpForm(value => ({ ...value, name: event.target.value }))} placeholder={t('Plugin name', 'ชื่อปลั๊กอิน')} maxLength={40} />
            {mcpForm.transport === 'http' ? <input value={mcpForm.url} onChange={event => setMcpForm(value => ({ ...value, url: event.target.value }))} placeholder="https://server.example.com/mcp" /> : <><input value={mcpForm.command} onChange={event => setMcpForm(value => ({ ...value, command: event.target.value }))} placeholder={t('Command, e.g. npx', 'คำสั่ง เช่น npx')} /><textarea value={mcpForm.arguments} onChange={event => setMcpForm(value => ({ ...value, arguments: event.target.value }))} placeholder={t('One argument per line\n-y\npackage-name', 'อาร์กิวเมนต์ บรรทัดละหนึ่งค่า\n-y\npackage-name')} /></>}
            <button className="mcp-install" onClick={installMcp} disabled={mcpBusy || !mcpForm.name.trim() || (mcpForm.transport === 'http' ? !mcpForm.url.trim() : !mcpForm.command.trim())}>{t('Install plugin', 'ติดตั้งปลั๊กอิน')}</button>
          </motion.section>}</AnimatePresence>
          <section className="mcp-installed"><span className="mcp-section-label">{t('Installed', 'ติดตั้งแล้ว')} {mcpServers.length}</span>{mcpServers.length === 0 && !mcpBusy ? <div className="mcp-empty">{t('No plugins installed', 'ยังไม่มีปลั๊กอิน')}</div> : mcpServers.map(server => { const http = server.transport?.type === 'streamable_http'; const auth = getMcpAuthState(server.auth_status, http); const authLabel = auth.kind === 'connected' ? t('Connected', 'เชื่อมแล้ว') : auth.kind === 'not-required' ? t('No sign-in needed', 'ไม่ต้องล็อกอิน') : auth.kind === 'not-connected' ? t('Not connected', 'ยังไม่เชื่อม') : t('Status unavailable', 'ไม่ทราบสถานะ'); return <div className={`mcp-server ${server.enabled ? '' : 'disabled'}`} key={server.name}><span className="mcp-server-icon">{http ? <Globe2 size={15} /> : <SquareTerminal size={15} />}</span><div className="mcp-server-info"><strong>{server.name}</strong><small>{http ? server.transport.url : [server.transport?.command, ...(server.transport?.args || [])].filter(Boolean).join(' ')}</small></div><span className={`mcp-auth ${auth.connected ? 'ready' : ''}`}>{authLabel}</span><div className="mcp-server-actions">{auth.canConnect && <button onClick={() => runMcpAction(() => api.mcpLogin(server.name))} disabled={mcpBusy || running}>{t('Connect', 'เชื่อมบัญชี')}</button>}{auth.canLogout && <button onClick={() => runMcpAction(() => api.mcpLogout(server.name))} disabled={mcpBusy || running}>{t('Sign out', 'ออกบัญชี')}</button>}<button title={server.enabled ? t('Disable', 'ปิด') : t('Enable', 'เปิด')} onClick={() => runMcpAction(() => api.mcpToggle(server.name, !server.enabled))} disabled={mcpBusy || running}><Power size={13} /></button><button title={t('Uninstall', 'ถอนการติดตั้ง')} onClick={() => confirm(t(`Uninstall ${server.name}?`, `ถอนปลั๊กอิน ${server.name} หรือไม่`)) && runMcpAction(() => api.mcpRemove(server.name))} disabled={mcpBusy || running}><Trash2 size={13} /></button></div></div> })}</section>
          {mcpBusy && <div className="mcp-loading"><i />{t('Working', 'กำลังดำเนินการ')}</div>}
          {mcpOutput && <pre className="mcp-output">{mcpOutput}</pre>}
          {mcpError && <div className="mcp-error">{mcpError}</div>}
        </div>
        <div className="mcp-footer"><ShieldCheck size={12} /><span>{t('Plugins can access data within the permissions you grant', 'ปลั๊กอินสามารถเข้าถึงข้อมูลตามสิทธิ์ที่คุณอนุมัติ')}</span></div>
      </motion.div>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{updateOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="update-modal app-manager" initial={{ opacity: 0, scale: .96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <button className="modal-close" onClick={() => setUpdateOpen(false)}><X size={16} /></button>
        <div className="update-brand"><div><Code2 size={18} /></div><span>CODEXDESK APP MANAGER</span></div>
        <h2>{updater.status === 'available' ? t(`Version ${updater.version} is available`, `พร้อมอัปเดตเป็น ${updater.version}`) : updater.status === 'downloaded' ? t('Ready to install', 'พร้อมติดตั้งอัปเดต') : updater.status === 'current' ? t('CodexDesk is up to date', 'เป็นเวอร์ชันล่าสุดแล้ว') : updater.status === 'error' ? t('Update check failed', 'ตรวจสอบอัปเดตไม่สำเร็จ') : updater.status === 'downloading' ? t('Downloading update', 'กำลังดาวน์โหลดอัปเดต') : t('Checking for updates', 'กำลังตรวจสอบอัปเดต')}</h2>
        <p>{updater.status === 'downloaded' ? t('The app will restart after installation.', 'แอปจะปิดและเปิดใหม่หลังติดตั้งเสร็จ') : updater.status === 'available' ? t('The update downloads only after you confirm.', 'ดาวน์โหลดเมื่อคุณกดยืนยันเท่านั้น') : updater.status === 'current' ? t('There is no newer version to install.', 'ยังไม่มีเวอร์ชันใหม่สำหรับติดตั้ง') : updater.status === 'error' ? t('Check your internet connection and try again.', 'ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง') : t('Connecting to GitHub Releases', 'กำลังเชื่อมต่อกับ GitHub Releases')}</p>
        <div className="update-progress"><i style={{ width: updater.status === 'downloading' ? `${updater.percent}%` : updater.status === 'downloaded' || updater.status === 'current' ? '100%' : updater.status === 'available' ? '35%' : '12%' }} /></div>
        <div className="update-stages"><span className="done"><i><Check size={10} /></i>{t('Installed', 'ติดตั้งแล้ว')}</span><span className={['available', 'downloading', 'downloaded'].includes(updater.status) ? 'done' : ''}><i>{['available', 'downloading', 'downloaded'].includes(updater.status) ? <Check size={10} /> : '2'}</i>{t('Download', 'ดาวน์โหลด')}</span><span className={updater.status === 'downloaded' ? 'done' : ''}><i>{updater.status === 'downloaded' ? <Check size={10} /> : '3'}</i>{t('Replace', 'ติดตั้งใหม่')}</span></div>
        <div className="update-details"><span>{t('Current version', 'เวอร์ชันปัจจุบัน')}</span><strong>{currentVersion || t('Checking', 'กำลังตรวจสอบ')}</strong><span>{t('New version', 'เวอร์ชันใหม่')}</span><strong>{updater.version || t('Checking', 'กำลังตรวจสอบ')}</strong></div>
        {updater.notes && <div className="update-notes"><strong>{t('Release notes', 'รายการเปลี่ยนแปลง')}</strong><p>{updater.notes}</p></div>}
        <button className="update-primary" onClick={updateApp} disabled={['checking', 'downloading'].includes(updater.status)}>{updater.status === 'available' ? t('Download update', 'ดาวน์โหลดอัปเดต') : updater.status === 'downloaded' ? t('Install and restart', 'ติดตั้งและเปิดใหม่') : updater.status === 'current' ? t('Check again', 'ตรวจสอบอีกครั้ง') : updater.status === 'error' ? t('Try again', 'ลองอีกครั้ง') : updater.status === 'downloading' ? t(`Downloading ${updater.percent}%`, `ดาวน์โหลด ${updater.percent}%`) : t('Checking', 'กำลังตรวจสอบ')}</button>
        <button className="uninstall-button" onClick={uninstallApp}>{t('Uninstall CodexDesk', 'ถอนการติดตั้ง CodexDesk')}</button>
        <span className="update-note">{t('CodexDesk never downloads or installs updates automatically', 'CodexDesk จะไม่ดาวน์โหลดหรือติดตั้งเอง')}</span>
      </motion.div>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{authOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="auth-modal" initial={{ opacity: 0, scale: .96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <button className="modal-close" onClick={() => setAuthOpen(false)}><X size={16} /></button>
        <div className={`auth-symbol ${authState}`}><LogIn size={21} /></div>
        <h2>{authState === 'success' ? t('Signed in', 'เข้าสู่ระบบสำเร็จ') : authMode === 'browser' ? t('Sign in with ChatGPT', 'เข้าสู่ระบบด้วย ChatGPT') : t('Sign in with a device code', 'เข้าสู่ระบบด้วยรหัสยืนยัน')}</h2>
        {authState === 'success' ? <><p>{t('Your ChatGPT account is ready to use with CodexDesk.', 'บัญชี ChatGPT พร้อมใช้งานกับ CodexDesk แล้ว')}</p><button className="auth-secondary logout-button" onClick={signOut} disabled={running}><LogOut size={14} />{t('Sign out', 'ออกจากระบบ')}</button></> : <>
          <p>{authMode === 'browser' ? t('Sign in in your browser, then return to CodexDesk.', 'เข้าสู่ระบบในเบราว์เซอร์ แล้วกลับมาที่ CodexDesk') : t('Open the verification page and enter the one-time code.', 'เปิดหน้าตรวจสอบและกรอกรหัสแบบใช้ครั้งเดียว')}</p>
          {authMode === 'device' && deviceCode && <button className="device-code" onClick={() => navigator.clipboard.writeText(deviceCode)}><strong>{deviceCode}</strong><Copy size={14} /></button>}
          {authUrl && authState === 'working' && <button className="auth-primary" onClick={() => api.openExternal(authUrl)}><ExternalLink size={15} />{t('Open sign-in page', 'เปิดหน้าเข้าสู่ระบบ')}</button>}
          {authState === 'working' && !authUrl && <div className="auth-loading"><i /><span>{authMode === 'browser' ? t('Opening sign-in page', 'กำลังเปิดหน้าเข้าสู่ระบบ') : t('Generating device code', 'กำลังสร้างรหัสยืนยัน')}</span></div>}
          {authState === 'working' && authMode === 'browser' && <button className="auth-secondary" onClick={() => startLogin('device')}>{t('Use a device code instead', 'ใช้รหัสยืนยันแทน')}</button>}
          {authState === 'working' && authMode === 'device' && <button className="auth-secondary" onClick={() => startLogin('browser')}>{t('Use browser sign-in', 'กลับไปเข้าสู่ระบบผ่านเบราว์เซอร์')}</button>}
          {authState === 'error' && <pre className="auth-error">{authOutput || t('Unable to sign in', 'ไม่สามารถเข้าสู่ระบบได้')}</pre>}
          {authState === 'error' && <button className="auth-primary" onClick={() => startLogin('browser')}>{t('Try again', 'ลองเข้าสู่ระบบอีกครั้ง')}</button>}
        </>}
      </motion.div>
    </motion.div>}</AnimatePresence>
  </div>
}

export default App
