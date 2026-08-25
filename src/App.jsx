import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Brain, Check, ChevronDown, ChevronRight, CircleStop, Code2, Command, Copy, Download, ExternalLink, File, FilePenLine, Folder, FolderOpen, GitCompare, Globe2, History, Image as ImageIcon, Info, ListTodo, LockKeyhole, LogIn, LogOut, Monitor, Palette, Paperclip, Plug, Plus, Power, RefreshCw, Save, Search, Send, Server, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, SquareTerminal, Trash2, Undo2, UserRound, Video, X } from 'lucide-react'

const api = window.codexDesk
const CodeEditor = lazy(() => import('./CodeEditor'))
const CHAT_COMMANDS = [
  { name: '/help', description: 'ดูคำสั่งทั้งหมด', descriptionEn: 'Show all commands' },
  { name: '/new', description: 'เริ่มแชทใหม่ในโฟลเดอร์นี้', descriptionEn: 'Start a new chat' },
  { name: '/delete', description: 'ลบแชทปัจจุบัน', descriptionEn: 'Delete the current chat' },
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
  { name: 'github', label: 'GitHub', description: 'Repository, Issue และ Pull Request', descriptionEn: 'Repositories, issues, and pull requests', url: 'https://api.githubcopilot.com/mcp/' },
  { name: 'canva', label: 'Canva', description: 'ค้นหาและจัดการงานออกแบบ', descriptionEn: 'Search and manage designs', url: 'https://mcp.canva.com/mcp' },
  { name: 'google_drive', label: 'Google Drive', description: 'ค้นหา อ่าน และจัดการไฟล์', descriptionEn: 'Search, read, and manage files', url: 'https://drivemcp.googleapis.com/mcp/v1' }
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
  generateMemories: true, disableMemoriesOnExternal: true,
  discordPresence: false, discordClientId: '', discordShowProject: true
}

function Toggle({ checked, onChange, disabled = false }) {
  return <button type="button" role="switch" aria-checked={checked} className={`settings-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} disabled={disabled}><i /></button>
}

function PlanCard({ compact = false, event, canDecide, onApprove, onCancel, translate }) {
  const labels = {
    generating: translate('Creating plan', 'กำลังสร้างแผน'),
    awaiting: translate('Plan ready', 'แผนพร้อมแล้ว'),
    running: translate('Working through plan', 'กำลังทำตามแผน'),
    completed: translate('Plan completed', 'ทำตามแผนเสร็จแล้ว'),
    failed: translate('Plan stopped', 'แผนหยุดทำงาน'),
    cancelled: translate('Plan cancelled', 'ยกเลิกแผนแล้ว')
  }
  return <div className={`plan-card ${event.status} ${compact ? 'compact' : ''}`}>
    <div className="plan-heading"><div><ListTodo size={14} /><strong>{labels[event.status] || labels.awaiting}</strong></div><span>{event.steps?.filter(step => step.status === 'completed').length || 0}/{event.steps?.length || 0}</span></div>
    {event.summary && <p>{event.summary}</p>}
    {event.status === 'generating' ? <div className="plan-generating"><i />{translate('Inspecting the project', 'กำลังตรวจโปรเจกต์')}</div> : <ol>{(event.steps || []).map((step, index) => <li className={step.status} key={`${event.id}-${index}`}><i>{step.status === 'completed' ? <Check size={11} /> : step.status === 'failed' ? <X size={11} /> : null}</i><span>{step.text}</span></li>)}</ol>}
    {event.status === 'awaiting' && canDecide && <div className="plan-actions"><button onClick={onCancel}>{translate('Cancel', 'ยกเลิก')}</button><button className="primary" onClick={onApprove}><Check size={12} />{translate('Approve and start', 'ยืนยันและเริ่มทำ')}</button></div>}
  </div>
}

function ActivityLogItem({ item, translate }) {
  const Icon = ['file_change', 'fileChange', 'file_change_summary'].includes(item.type) ? FilePenLine
    : ['command_execution', 'commandExecution'].includes(item.type) ? SquareTerminal
      : ['web_search', 'webSearch'].includes(item.type) ? Globe2
        : ['mcp_tool_call', 'mcpToolCall'].includes(item.type) ? Plug
          : item.type === 'reasoning' ? Brain : ListTodo
  const statusLabel = item.status === 'running' ? translate('Running', 'กำลังทำงาน') : item.status === 'failed' ? translate('Failed', 'ไม่สำเร็จ') : translate('Completed', 'เสร็จแล้ว')
  const timestamp = item.startedAt ? new Date(item.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
  const elapsed = item.finishedAt && item.startedAt ? Math.max(0, item.finishedAt - item.startedAt) : 0
  const elapsedLabel = elapsed >= 1000 ? `${(elapsed / 1000).toFixed(elapsed >= 10000 ? 0 : 1)}s` : elapsed > 0 ? `${elapsed}ms` : ''
  return <div className={`activity-item ${item.status}`}>
    <div className="activity-icon"><Icon size={12} /></div>
    <div className="activity-body">
      <div className="activity-title"><strong>{item.title}</strong>{(item.additions > 0 || item.deletions > 0) && <span><b>+{item.additions}</b><em>-{item.deletions}</em></span>}</div>
      <div className="activity-meta"><span className="activity-state">{item.status === 'running' && <i />}{statusLabel}</span>{timestamp && <time>{timestamp}</time>}{elapsedLabel && <span>{elapsedLabel}</span>}{item.exitCode !== null && item.exitCode !== undefined && <span>exit {item.exitCode}</span>}</div>
      {item.changes?.length > 0 && <div className="file-change-list">{item.changes.map((change, index) => <div className="file-change-row" key={`${change.path}-${index}`}><FilePenLine size={12} /><span title={change.path}>{change.path}</span>{(change.additions > 0 || change.deletions > 0) && <><b>+{change.additions}</b><em>-{change.deletions}</em></>}</div>)}</div>}
      {item.command && <pre className="activity-command">$ {item.command}</pre>}
      {item.output && <pre className="activity-output">{item.output}</pre>}
    </div>
  </div>
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
        {section === 'general' && <><div className="settings-title"><Monitor size={18} /><div><h3>{l('General', 'ทั่วไป')}</h3><p>{l('Appearance and app behavior', 'หน้าตาและพฤติกรรมของแอป')}</p></div></div><div className="settings-grid">{select('language', l('App language', 'ภาษาแอป'), draft.language, [{ value: 'en', label: 'English' }, { value: 'th', label: 'ไทย' }])}{select('theme', l('Theme', 'ธีม'), draft.theme, [{ value: 'black', label: l('Pure black', 'ดำสนิท') }, { value: 'dark', label: l('Dark gray', 'เทาเข้ม') }, { value: 'light', label: l('Light', 'สว่าง') }, { value: 'system', label: l('System', 'ตามระบบ') }])}{select('density', l('Density', 'ความหนาแน่น'), draft.density, [{ value: 'comfortable', label: l('Comfortable', 'สบายตา') }, { value: 'compact', label: l('Compact', 'กะทัดรัด') }])}{select('sendMode', l('Send message', 'ปุ่มส่งข้อความ'), draft.sendMode, [{ value: 'enter', label: l('Enter to send', 'Enter เพื่อส่ง') }, { value: 'ctrl-enter', label: l('Ctrl + Enter to send', 'Ctrl + Enter เพื่อส่ง') }])}</div>{row(l('Auto-scroll chat', 'เลื่อนแชทอัตโนมัติ'), l('Follow new messages while Codex is working', 'ตามข้อความใหม่ระหว่าง Codex ทำงาน'), 'autoScroll')}{row(l('Prevent sleep while app is open', 'ป้องกันเครื่องพักระหว่างเปิดแอป'), l('Keeps long-running tasks active in the background', 'ช่วยให้งานยาวทำต่อได้ในเบื้องหลัง'), 'preventSleep')}{row(l('Notify when tasks finish', 'แจ้งเตือนเมื่องานเสร็จ'), l('Show a Windows notification when the app is not focused', 'แสดง Windows notification เมื่อแอปไม่ได้อยู่ด้านหน้า'), 'notifications')}</>}
        {section === 'personal' && <><div className="settings-title"><Palette size={18} /><div><h3>Personalization</h3><p>{l('Choose how Codex responds and remembers context', 'กำหนดวิธีที่ Codex ตอบและจดจำบริบท')}</p></div></div>{select('personality', l('Response style', 'บุคลิกการตอบ'), draft.personality, [{ value: 'pragmatic', label: l('Pragmatic and concise', 'กระชับและตรงประเด็น') }, { value: 'friendly', label: l('Friendly and explanatory', 'เป็นมิตรและอธิบายมากขึ้น') }, { value: 'none', label: l('No personality', 'ไม่กำหนดบุคลิก') }])}<label className="settings-field full"><span>{l('Custom instructions', 'คำแนะนำส่วนตัว')}</span><textarea value={draft.customInstructions} onChange={event => set('customInstructions', event.target.value)} maxLength={12000} placeholder={l('For example: use clean code and verify changes before editing', 'เช่น ตอบเป็นภาษาไทย เขียนโค้ดให้อ่านง่าย และตรวจสอบก่อนแก้ไข')} /><small>{draft.customInstructions.length.toLocaleString()} / 12,000 {l('characters', 'ตัวอักษร')}</small></label><div className="settings-subheading"><Brain size={14} />{l('Codex memories', 'ความทรงจำของ Codex')}</div>{row(l('Enable memories', 'เปิดใช้ความทรงจำ'), l('Use the Codex CLI memory system', 'ให้ Codex ใช้ระบบ memories ของ CLI'), 'memoriesEnabled')}{row(l('Use saved memories', 'ใช้ความทรงจำที่มีอยู่'), l('Apply remembered context to future tasks', 'นำสิ่งที่จำไว้มาใช้กับงานใหม่'), 'useMemories', !draft.memoriesEnabled)}{row(l('Generate new memories', 'สร้างความทรงจำใหม่'), l('Learn reusable guidance for future tasks', 'เรียนรู้คำแนะนำที่เป็นประโยชน์สำหรับงานถัดไป'), 'generateMemories', !draft.memoriesEnabled)}{row(l('Disable with external context', 'ปิดเมื่อมีบริบทภายนอก'), l('Reduce context mixing when external tools are connected', 'ลดการผสมข้อมูลเมื่อเชื่อมเครื่องมือภายนอก'), 'disableMemoriesOnExternal', !draft.memoriesEnabled)}</>}
        {section === 'model' && <><div className="settings-title"><Brain size={18} /><div><h3>{l('Model & web search', 'โมเดลและการค้นเว็บ')}</h3><p>{l('Defaults used by Codex CLI for new tasks', 'ค่าหลักที่ Codex CLI ใช้กับทุกแชทใหม่')}</p></div></div>{select('model', l('Model', 'โมเดล'), draft.model, [{ value: '', label: l('Account default', 'ค่าเริ่มต้นของบัญชี') }, { value: 'gpt-5.6-sol', label: l('GPT-5.6 Sol — most capable', 'GPT-5.6 Sol — ฉลาดที่สุด') }, { value: 'gpt-5.6-terra', label: l('GPT-5.6 Terra — balanced', 'GPT-5.6 Terra — สมดุล') }, { value: 'gpt-5.6-luna', label: l('GPT-5.6 Luna — fast and efficient', 'GPT-5.6 Luna — เร็วและประหยัด') }, { value: 'gpt-5.5', label: l('GPT-5.5 — previous generation', 'GPT-5.5 — รุ่นก่อนหน้า') }])}<div className="settings-subheading"><Brain size={14} />{l('Reasoning effort', 'ระดับการคิด')}</div><div className="reasoning-picker">{[{ value: 'low', label: 'Low', detail: l('Fast, lower usage', 'เร็วและใช้น้อย') }, { value: 'medium', label: 'Medium', detail: l('Balanced, recommended', 'สมดุล แนะนำ') }, { value: 'high', label: 'High', detail: l('More thorough', 'คิดละเอียดขึ้น') }, { value: 'xhigh', label: 'Extra high', detail: l('Most complex tasks', 'งานซับซ้อนที่สุด') }].map(option => <button key={option.value} className={draft.reasoningEffort === option.value ? 'active' : ''} onClick={() => set('reasoningEffort', option.value)}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div><p className="usage-hint">{l('Higher levels usually take longer and use more quota. Actual usage depends on the model, task, and ChatGPT plan.', 'ระดับที่สูงขึ้นมักใช้เวลานานและใช้โควตามากขึ้น จำนวนจริงขึ้นอยู่กับโมเดล งาน และแผน ChatGPT ของคุณ')}</p>{select('webSearch', l('Web search', 'การค้นเว็บ'), draft.webSearch, [{ value: 'cached', label: l('Cached — safer default', 'Cached ปลอดภัยกว่า') }, { value: 'live', label: l('Live — latest information', 'Live ข้อมูลล่าสุด') }, { value: 'disabled', label: l('Disabled', 'ปิด') }])}<div className="settings-callout"><Globe2 size={15} /><div><strong>{l('Codex can search the web', 'Codex ค้นเว็บได้จริง')}</strong><p>{l('Cached uses OpenAI’s search index. Live fetches current pages. Web content can be untrusted, so verify sources.', 'Cached ใช้ดัชนีของ OpenAI ส่วน Live เปิดหน้าเว็บล่าสุด การค้นเว็บอาจพบเนื้อหาที่ไม่น่าเชื่อถือ ควรตรวจแหล่งอ้างอิงเสมอ')}</p></div></div></>}
        {section === 'permissions' && <><div className="settings-title"><LockKeyhole size={18} /><div><h3>{l('Default permissions', 'สิทธิ์เริ่มต้น')}</h3><p>{l('Applied the next time the app starts', 'ใช้เมื่อเริ่มแอปครั้งถัดไป')}</p></div></div>{row(l('Allow file edits', 'อนุญาตแก้ไขไฟล์'), l('Codex can read, create, edit, and run tools in the project', 'Codex อ่าน สร้าง แก้ไข และรันเครื่องมือในโปรเจกต์ได้'), 'defaultAllowEdit')}<div className="settings-grid">{select('defaultApproval', l('Confirmation before tasks', 'การยืนยันก่อนเริ่มงาน'), draft.defaultApproval, [{ value: 'ask', label: l('Create plan first', 'สร้างแผนก่อน') }, { value: 'auto', label: l('Automatic', 'ทำอัตโนมัติ') }])}</div><div className="settings-callout"><ShieldCheck size={15} /><div><strong>{l('Permissions apply to local work', 'สิทธิ์มีผลกับงานในเครื่อง')}</strong><p>{l('Plan mode inspects the project read-only, then waits for your approval before starting. Risky commands remain subject to Codex and operating-system policy.', 'โหมดแผนจะตรวจโปรเจกต์แบบอ่านอย่างเดียว แล้วรอให้คุณยืนยันก่อนเริ่มทำงาน ส่วนคำสั่งเสี่ยงยังขึ้นอยู่กับนโยบายของ Codex และระบบปฏิบัติการ')}</p></div></div></>}
        {section === 'integrations' && <><div className="settings-title"><Plug size={18} /><div><h3>{l('Integrations', 'การเชื่อมต่อ')}</h3><p>{l('ChatGPT account, MCP tools, and Discord', 'บัญชี ChatGPT เครื่องมือ MCP และ Discord')}</p></div></div><div className="settings-account"><span className={authenticated ? 'ready' : ''}>{authenticated ? <Check size={16} /> : <LogIn size={16} />}</span><div><strong>{authenticated ? l('ChatGPT connected', 'เชื่อมต่อ ChatGPT แล้ว') : l('ChatGPT not connected', 'ยังไม่ได้เชื่อมต่อ ChatGPT')}</strong><small>{l('Codex CLI uses this account to process tasks', 'Codex CLI ใช้บัญชีนี้เพื่อประมวลผลงาน')}</small></div>{authenticated && <button onClick={onSignOut}>{l('Sign out', 'ออกจากระบบ')}</button>}</div><button className="settings-wide-action" onClick={onOpenMcp}><Plug size={14} /><div><strong>{l('Manage MCP plugins', 'จัดการปลั๊กอิน MCP')}</strong><small>{l('GitHub, Canva, Google Drive, and your own servers', 'GitHub, Canva, Google Drive และเซิร์ฟเวอร์ของคุณ')}</small></div><ChevronRight size={15} /></button><div className="settings-subheading"><Bot size={14} />Discord Rich Presence</div>{row(l('Show CodexDesk in Discord', 'แสดง CodexDesk ใน Discord'), l('Discord Desktop must be running', 'ต้องเปิดโปรแกรม Discord Desktop'), 'discordPresence')}<label className="settings-field full"><span>{l('Discord Application ID', 'Discord Application ID')}</span><input value={draft.discordClientId} onChange={event => set('discordClientId', event.target.value.replace(/\D/g, '').slice(0, 24))} disabled={!draft.discordPresence} placeholder="123456789012345678" /><small>{l('Create an application in the Discord Developer Portal and copy its Application ID.', 'สร้างแอปใน Discord Developer Portal แล้วคัดลอก Application ID')}</small></label>{row(l('Show project name', 'แสดงชื่อโปรเจกต์'), l('Displays “In project-name” in your Discord activity', 'แสดง “ใน ชื่อโปรเจกต์” บนสถานะ Discord'), 'discordShowProject', !draft.discordPresence)}</>}
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

function normalizeChatMarkdown(value) {
  return String(value || '')
    .replace(/\((https:\/\/[^\s)]+)\)\[([^\]\n]+)\]/gi, '[$2]($1)')
    .replace(/\(([^)\n]+)\)\[(https:\/\/[^\]\s]+)\]/gi, '[$1]($2)')
}

function markdownNodeText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(markdownNodeText).join('')
  return value?.props ? markdownNodeText(value.props.children) : ''
}

function MarkdownCopyBox({ children, translate }) {
  const [copied, setCopied] = useState(false)
  const content = markdownNodeText(children).replace(/\n$/, '')
  const className = Array.isArray(children) ? children[0]?.props?.className : children?.props?.className
  const language = String(className || '').replace(/^language-/, '') || 'text'
  const copy = async () => {
    await api.copyText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  return <div className="markdown-copy-box"><div className="markdown-box-heading"><span>{['text', 'txt', 'plaintext', 'markdown', 'md'].includes(language.toLowerCase()) ? 'TEXT' : language.toUpperCase()}</span><button onClick={() => void copy()}><Copy size={11} />{copied ? translate('Copied', 'คัดลอกแล้ว') : translate('Copy', 'คัดลอก')}</button></div><pre>{children}</pre></div>
}

function MarkdownMessage({ onOpenFile, text, translate }) {
  const openLink = href => {
    if (!href) return
    if (/^https:\/\//i.test(href)) void api.openLink(href)
    else void onOpenFile(href)
  }
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      a: ({ href, children }) => <button className="markdown-link" onClick={() => openLink(href)}>{children}</button>,
      pre: ({ children }) => <MarkdownCopyBox translate={translate}>{children}</MarkdownCopyBox>
    }}
  >{normalizeChatMarkdown(text)}</ReactMarkdown>
}

function extractResponseArtifact(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind !== 'agent_message' || !event.text) continue
    const blocks = [...event.text.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)]
    if (!blocks.length) return null
    const block = blocks.at(-1)
    const language = block[1].trim().toLowerCase() || 'plaintext'
    return {
      id: `${event.id || index}-${blocks.length}`,
      content: block[2].replace(/\n$/, ''),
      language,
      type: ['text', 'txt', 'plaintext', 'markdown', 'md'].includes(language) ? 'text' : 'code'
    }
  }
  return null
}

function waitForMedia(element, eventName) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve() }
    const fail = () => { cleanup(); reject(new Error('Unable to read this video format.')) }
    const cleanup = () => {
      element.removeEventListener(eventName, done)
      element.removeEventListener('error', fail)
    }
    element.addEventListener(eventName, done, { once: true })
    element.addEventListener('error', fail, { once: true })
  })
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to capture a video frame.')), 'image/jpeg', .88))
}

async function captureVideoFrames(file) {
  const source = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.src = source
  const paths = []
  try {
    await waitForMedia(video, 'loadedmetadata')
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('Unable to read this video format.')
    if (video.readyState < 2) await waitForMedia(video, 'loadeddata')
    const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d', { alpha: false })
    const count = Math.min(8, Math.max(3, Math.ceil(video.duration / 15)))
    for (let index = 0; index < count; index += 1) {
      const target = count === 1 ? 0 : Math.min(video.duration - .05, (video.duration * index) / (count - 1))
      const nextTime = Math.max(0, target)
      if (Math.abs(video.currentTime - nextTime) > .001) {
        const seeked = waitForMedia(video, 'seeked')
        video.currentTime = nextTime
        await seeked
      } else {
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await canvasBlob(canvas)
      paths.push(await api.saveAttachment({ name: `${file.name}-frame-${index + 1}.jpg`, type: 'image/jpeg', data: await blob.arrayBuffer() }))
    }
    return paths
  } catch (error) {
    if (paths.length) await api.removeAttachments(paths).catch(() => {})
    throw error
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(source)
  }
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
    const additions = Number(change.additions ?? change.lines_added ?? change.added_lines)
    const deletions = Number(change.deletions ?? change.lines_deleted ?? change.deleted_lines)
    return {
      path: change.path || change.file_path || 'File',
      kind: change.kind || 'update',
      additions: Number.isFinite(additions) ? Math.max(0, additions) : stats.additions,
      deletions: Number.isFinite(deletions) ? Math.max(0, deletions) : stats.deletions
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
  const [runningChats, setRunningChats] = useState({})
  const [events, setEvents] = useState([])
  const [notices, setNotices] = useState([])
  const [authenticated, setAuthenticated] = useState(false)
  const [weeklyUsage, setWeeklyUsage] = useState({ status: 'idle' })
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
  const [artifactView, setArtifactView] = useState(null)
  const [artifactWidth, setArtifactWidth] = useState(() => {
    const saved = Number.parseInt(window.localStorage.getItem('codexdesk-artifact-width') || '', 10)
    return Number.isFinite(saved) ? Math.max(320, Math.min(900, saved)) : 480
  })
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
  const [attachments, setAttachments] = useState([])
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [systemLight, setSystemLight] = useState(() => window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false)
  const codexBuffers = useRef(new Map())
  const conversationEnd = useRef(null)
  const runningChatsRef = useRef(new Set())
  const queuesByChat = useRef(new Map())
  const sessionsByChat = useRef(new Map())
  const activitiesByChat = useRef(new Map())
  const conversationIdRef = useRef(null)
  const leftCtrlPressed = useRef(false)
  const sessionIdRef = useRef(null)
  const workspacePromise = useRef(null)
  const editorRef = useRef(null)
  const pendingEditorLocation = useRef(null)
  const attachmentInput = useRef(null)
  const promptInput = useRef(null)
  const artifactEvent = useRef(null)
  const openedChange = useRef(null)
  const usageRequestId = useRef(0)
  const usageRefreshing = useRef(false)
  const planStateByChat = useRef(new Map())
  const pendingPlansByChat = useRef(new Map())
  const activePlanByChat = useRef(new Map())
  const activeTasksByChat = useRef(new Map())
  const statsRefreshByChat = useRef(new Set())

  const t = (english, thai) => settings.language === 'th' ? thai : english
  const lightTheme = settings.theme === 'light' || (settings.theme === 'system' && systemLight)
  const running = Boolean(conversationId && runningChats[conversationId])
  const hasRunningChats = Object.keys(runningChats).length > 0
  const dirty = currentFile && content !== savedContent
  const commandSuggestions = prompt.startsWith('/') && !prompt.includes('\n') ? CHAT_COMMANDS.filter(command => command.name.startsWith(prompt.split(/\s+/)[0].toLowerCase())).slice(0, 7) : []
  const liveActivity = activity.slice().reverse().find(item => item.status === 'running') || activity.at(-1)
  const currentTaskIndex = activity.map(item => item.type).lastIndexOf('task')
  const currentTaskActivity = currentTaskIndex >= 0 ? activity.slice(currentTaskIndex) : activity
  const snapshotStats = currentTaskActivity.find(item => item.type === 'file_change_summary')
  const liveStats = snapshotStats || currentTaskActivity.reduce((total, item) => ({ additions: total.additions + (item.additions || 0), deletions: total.deletions + (item.deletions || 0) }), { additions: 0, deletions: 0 })
  const visibleFiles = useMemo(() => filterFileTree(files, fileQuery), [files, fileQuery])
  const responseArtifact = useMemo(() => extractResponseArtifact(events), [events])
  const currentPlan = events.filter(event => event.kind === 'plan').at(-1) || null
  const currentPlanVisible = currentPlan && ['generating', 'awaiting', 'running'].includes(currentPlan.status)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!media) return undefined
    const update = event => setSystemLight(event.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    const fit = () => {
      if (window.innerWidth > 900) setArtifactWidth(current => clampArtifactWidth(current))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    if (!responseArtifact) {
      if (artifactView === 'response') setArtifactView(null)
      return
    }
    if (responseArtifact.id === artifactEvent.current) return
    artifactEvent.current = responseArtifact.id
    setArtifactView('response')
  }, [responseArtifact?.id, artifactView])

  useEffect(() => {
    if (currentPlanVisible) setArtifactView('plan')
  }, [currentPlan?.id, currentPlan?.status, currentPlanVisible])

  useEffect(() => {
    if (running || dirty || !project) return
    const item = activity.slice().reverse().find(entry => entry.changes?.some(change => change.path))
    const change = item?.changes?.find(entry => entry.path)
    const key = change ? `${item.id}:${change.path}` : null
    if (!key || key === openedChange.current) return
    openedChange.current = key
    api.resolveFileLink(change.path).then(async target => {
      const text = await api.readFile(target.path)
      setCurrentFile({ path: target.path, name: target.name })
      setContent(text)
      setSavedContent(text)
      setArtifactView('file')
    }).catch(() => {})
  }, [running, activity, project?.path])

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
      if (!value.authenticated) setAuthState('idle')
    })
  }, [])

  useEffect(() => {
    if (!authenticated) {
      usageRequestId.current += 1
      setWeeklyUsage({ status: 'signed-out' })
      return undefined
    }
    void refreshWeeklyUsage()
    return undefined
  }, [authenticated])

  useEffect(() => api.onCodexEvent(event => {
    if (event.type === 'done') {
      parseCodexOutput('', true, event.conversationId)
      if (authenticated) window.setTimeout(() => void refreshWeeklyUsage(false), 1000)
    }
    if (event.type === 'stdout') parseCodexOutput(event.data, false, event.conversationId)
    if (event.type === 'stderr' || event.type === 'error') appendChatEvents(event.conversationId, [{ kind: 'error', text: event.data }])
  }), [settings.language, authenticated])

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
    if (conversationId) activitiesByChat.current.set(conversationId, activity)
  }, [conversationId, activity])

  async function refreshWeeklyUsage(showLoading = true) {
    if (usageRefreshing.current) return
    usageRefreshing.current = true
    const requestId = ++usageRequestId.current
    if (showLoading) setWeeklyUsage(current => ({ ...current, status: 'loading' }))
    try {
      const usage = await api.usageGet()
      if (requestId === usageRequestId.current) setWeeklyUsage(usage)
    } catch {
      if (requestId === usageRequestId.current) setWeeklyUsage({ status: 'unavailable' })
    } finally {
      usageRefreshing.current = false
    }
  }

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
    if (['checking', 'downloading', 'installing'].includes(updater.status)) return
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
    if (mcpBusy || hasRunningChats) return false
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
      addSystemMessage(saved.language === 'th' ? 'บันทึกการตั้งค่าแล้ว ค่าของ Codex จะใช้กับงานถัดไป' : 'Settings saved. Codex will use them for the next task.')
    } catch (error) {
      alert(t(`Could not save settings: ${error.message}`, `บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`))
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
    if (!confirm(t('Delete all local chat and undo history? This cannot be undone.', 'ลบประวัติแชทและจุดย้อนกลับทั้งหมดในเครื่องหรือไม่ การกระทำนี้ย้อนกลับไม่ได้'))) return
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
      alert(t('Local data deleted.', 'ลบข้อมูลในเครื่องแล้ว'))
    } catch (error) {
      alert(error.message)
    }
  }

  async function uninstallApp() {
    if (!confirm(t('Uninstall CodexDesk? Chat history and settings will be kept.', 'ถอนการติดตั้ง CodexDesk หรือไม่ ประวัติแชทและการตั้งค่าจะยังถูกเก็บไว้'))) return
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
    installing: t('Opening installer...', 'กำลังเปิดตัวติดตั้ง...'),
    error: t('Check again', 'ตรวจใหม่')
  })[updater.status] || t('Check updates', 'ตรวจอัปเดต')

  const authUrl = authOutput.match(/https:\/\/(?:auth\.openai\.com|chatgpt\.com)\/[A-Za-z0-9/_?=&.%-]+/)?.[0]
  const deviceCode = authOutput.match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0]
  const weeklyRemaining = Number.isFinite(weeklyUsage.remainingPercent) ? Math.max(0, Math.min(100, weeklyUsage.remainingPercent)) : 0
  const weeklyStatusLabel = weeklyUsage.status === 'ready'
    ? t(`${weeklyRemaining}% remaining`, `เหลือ ${weeklyRemaining}%`)
    : weeklyUsage.status === 'loading'
      ? t('Loading…', 'กำลังโหลด…')
      : weeklyUsage.status === 'signed-out'
        ? t('Sign in required', 'ต้องเข้าสู่ระบบ')
        : t('Unavailable', 'ไม่พร้อมใช้งาน')
  const weeklyMetaLabel = weeklyUsage.resetsAt
    ? `${t('Resets', 'รีเซ็ต')} ${new Date(weeklyUsage.resetsAt * 1000).toLocaleString(settings.language === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}`
    : weeklyUsage.planType || t('ChatGPT account usage', 'การใช้งานบัญชี ChatGPT')

  async function loadProject(value) {
    setHistoryReady(false)
    setProject(value)
    setEvents([])
    const [nextFiles, history, undoHistory] = await Promise.all([api.listFiles(), api.historyGet(), api.undoList()])
    const historyList = await api.historyList()
    setFiles(nextFiles)
    setUndoStack(undoHistory)
    setConversations(historyList)
    applyConversation(history)
    setHistoryReady(true)
  }

  async function openProject() {
    if (hasRunningChats) {
      addSystemMessage(t('Stop all running chats before changing the project.', 'กรุณาหยุดแชทที่กำลังทำงานทั้งหมดก่อนเปลี่ยนโปรเจกต์'))
      return
    }
    if (project && historyReady) await api.historySave({ conversationId, events, sessionId }).catch(() => {})
    setHistoryReady(false)
    const value = await api.openProject()
    if (value) {
      setCurrentFile(null)
      setContent('')
      setSavedContent('')
      queuesByChat.current.clear()
      setQueue([])
      setActivity([])
      await loadProject(value)
      setArtifactView('files')
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

  async function openFile(node, location = null) {
    if (dirty && !confirm(t('You have unsaved changes. Open another file anyway?', 'มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการเปิดไฟล์อื่นหรือไม่'))) return
    try {
      const text = await api.readFile(node.path)
      pendingEditorLocation.current = location ? { path: node.path, ...location } : null
      setCurrentFile(node)
      setContent(text)
      setSavedContent(text)
      setMobileView('editor')
      setArtifactView('file')
    } catch (error) {
      alert(error.message)
    }
  }

  async function openFileLink(reference) {
    try {
      const target = await api.resolveFileLink(reference)
      await openFile({ path: target.path, name: target.name }, { line: target.line, column: target.column })
    } catch (error) {
      alert(error.message)
    }
  }

  function mountEditor(editor) {
    editorRef.current = editor
  }

  useEffect(() => {
    const target = pendingEditorLocation.current
    if (!target || target.path !== currentFile?.path || !editorRef.current) return undefined
    const timer = setTimeout(() => {
      const editor = editorRef.current
      const model = editor?.getModel()
      if (!editor || !model) return
      const lineNumber = Math.min(target.line, model.getLineCount())
      const column = Math.min(target.column, model.getLineMaxColumn(lineNumber))
      editor.setPosition({ lineNumber, column })
      editor.revealLineInCenter(lineNumber)
      editor.focus()
      pendingEditorLocation.current = null
    }, 0)
    return () => clearTimeout(timer)
  }, [currentFile])

  async function saveFile() {
    if (!currentFile) return
    await api.writeFile(currentFile.path, content)
    setSavedContent(content)
  }

  async function loadDiff() {
    const result = await api.gitDiff()
    setDiff(result.output || t('No changes', 'ไม่มีการเปลี่ยนแปลง'))
    setArtifactView('diff')
  }

  function setChatRunning(chatId, value) {
    if (!chatId) return
    if (value) runningChatsRef.current.add(chatId)
    else runningChatsRef.current.delete(chatId)
    setRunningChats(Object.fromEntries([...runningChatsRef.current].map(id => [id, true])))
  }

  function appendChatEvents(chatId, additions, nextSessionId = null) {
    if (!chatId || (!additions.length && !nextSessionId)) return
    if (nextSessionId) sessionsByChat.current.set(chatId, nextSessionId)
    if (chatId === conversationIdRef.current) {
      if (nextSessionId) {
        sessionIdRef.current = nextSessionId
        setSessionId(nextSessionId)
      }
      if (additions.length) setEvents(items => [...items, ...additions])
    } else {
      void api.historyAppend({ conversationId: chatId, events: additions, sessionId: nextSessionId }).then(() => api.historyList()).then(setConversations).catch(() => {})
    }
  }

  function updatePlanEvent(chatId, updater) {
    const current = planStateByChat.current.get(chatId)
    if (!current) return
    const next = updater(current)
    if (!next) return
    planStateByChat.current.set(chatId, next)
    if (chatId === conversationIdRef.current) {
      setEvents(items => items.map(event => event.id === next.id ? next : event))
    } else {
      void api.historyUpdateEvent({ conversationId: chatId, event: next }).catch(() => {})
    }
  }

  function planStepsFromItem(item) {
    let source = item?.steps || item?.items || item?.todos || item?.entries || item?.plan || []
    if (!Array.isArray(source) && Array.isArray(source?.steps)) source = source.steps
    if (!Array.isArray(source)) return []
    return source.flatMap(step => {
      const text = typeof step === 'string' ? step : step?.step || step?.text || step?.title || step?.description
      if (!text) return []
      const rawStatus = typeof step === 'string' ? 'pending' : String(step.status || step.state || '').toLowerCase()
      const status = ['completed', 'complete', 'done'].includes(rawStatus) ? 'completed'
        : ['in_progress', 'in-progress', 'inprogress', 'running', 'active'].includes(rawStatus) ? 'in_progress'
          : ['failed', 'error'].includes(rawStatus) ? 'failed' : 'pending'
      return [{ text: String(text).trim(), status }]
    }).slice(0, 12)
  }

  function applyCodexPlanUpdate(chatId, item) {
    const steps = planStepsFromItem(item)
    if (!steps.length || !activePlanByChat.current.has(chatId)) return
    updatePlanEvent(chatId, event => ({ ...event, status: 'running', steps }))
  }

  async function refreshTaskStats(chatId) {
    const task = activeTasksByChat.current.get(chatId)
    if (!task?.snapshotId || statsRefreshByChat.current.has(chatId)) return
    statsRefreshByChat.current.add(chatId)
    try {
      const stats = await api.undoStats(task.snapshotId)
      const item = {
        id: `stats-${task.id}`,
        type: 'file_change_summary',
        title: t(`Changed ${stats.changes.length} file${stats.changes.length === 1 ? '' : 's'}`, `เปลี่ยนแปลง ${stats.changes.length} ไฟล์`),
        output: '',
        status: 'completed',
        changes: stats.changes,
        additions: stats.additions,
        deletions: stats.deletions,
        startedAt: Date.now(),
        finishedAt: Date.now()
      }
      setChatActivity(chatId, items => {
        const index = items.findIndex(entry => entry.id === item.id)
        if (index < 0) return [...items.slice(-99), item]
        return items.map((entry, position) => position === index ? item : entry)
      })
    } catch {} finally {
      statsRefreshByChat.current.delete(chatId)
    }
  }

  function parseCodexOutput(raw, flush = false, chatId = conversationIdRef.current) {
    if (!chatId) return
    const buffered = (codexBuffers.current.get(chatId) || '') + raw
    const lines = buffered.split(/\r?\n/)
    const tail = lines.pop() ?? ''
    if (flush) codexBuffers.current.delete(chatId)
    else codexBuffers.current.set(chatId, tail)
    if (flush && tail) lines.push(tail)
    const additions = []
    let nextSessionId = null
    for (const line of lines.filter(Boolean)) {
      try {
        const event = JSON.parse(line)
        if (event.type === 'thread.started' && event.thread_id) {
          nextSessionId = event.thread_id
        }
        if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          additions.push({ kind: 'agent_message', text: event.item.text })
        }
        if (['plan', 'plan_update', 'planUpdate', 'todo_list', 'todoList'].includes(event.item?.type)) applyCodexPlanUpdate(chatId, event.item)
        if (event.item && event.item.type !== 'agent_message') updateActivity(event, chatId)
        if (event.type === 'item.completed' && ['file_change', 'fileChange'].includes(event.item?.type)) void refreshTaskStats(chatId)
        if (event.type === 'error') {
          additions.push({ kind: 'error', text: event.message || t('Codex could not complete the task.', 'Codex ทำงานไม่สำเร็จ') })
        }
      } catch {
        if (!/codex_core|Wall time:|Exit code:|rejected: blocked by policy/i.test(line)) {
          additions.push({ kind: 'output', text: line })
        }
      }
    }
    appendChatEvents(chatId, additions, nextSessionId)
  }

  function setChatActivity(chatId, updater) {
    if (chatId === conversationIdRef.current) {
      setActivity(items => {
        const next = updater(items)
        activitiesByChat.current.set(chatId, next)
        return next
      })
      return
    }
    const current = activitiesByChat.current.get(chatId) || []
    activitiesByChat.current.set(chatId, updater(current))
  }

  function activityCommandTitle(command, running) {
    const value = String(command || '').replace(/\s+/g, ' ').trim()
    const verb = (activeEn, doneEn, activeTh, doneTh) => running ? t(activeEn, activeTh) : t(doneEn, doneTh)
    if (/\b(cat|type|sed|head|tail|Get-Content)(\.exe)?\b|\brg(\.exe)?\s+--files\b/i.test(value)) return verb('Reading project files', 'Read project files', 'กำลังอ่านไฟล์โปรเจกต์', 'อ่านไฟล์โปรเจกต์แล้ว')
    if (/\b(rg|grep|findstr)(\.exe)?\b/i.test(value)) return verb('Searching project files', 'Searched project files', 'กำลังค้นหาในไฟล์โปรเจกต์', 'ค้นหาในไฟล์โปรเจกต์แล้ว')
    if (/\b(npm|pnpm|yarn)(\.cmd|\.exe)?\s+(run\s+)?(test|build|lint)|\b(pytest|vitest|jest)(\.exe)?\b/i.test(value)) return verb('Running project checks', 'Project checks finished', 'กำลังตรวจสอบโปรเจกต์', 'ตรวจสอบโปรเจกต์เสร็จแล้ว')
    if (/\b(node|python|py)(\.exe)?\b.*(--check|-m\s+compileall)/i.test(value)) return verb('Checking code', 'Code check finished', 'กำลังตรวจสอบโค้ด', 'ตรวจสอบโค้ดเสร็จแล้ว')
    if (/\bgit(\.exe)?\s+(diff|status|log)\b/i.test(value)) return verb('Inspecting Git changes', 'Inspected Git changes', 'กำลังตรวจการเปลี่ยนแปลง Git', 'ตรวจการเปลี่ยนแปลง Git แล้ว')
    return verb('Running command', 'Command finished', 'กำลังรันคำสั่ง', 'รันคำสั่งเสร็จแล้ว')
  }

  function updateActivity(event, chatId = conversationIdRef.current) {
    const item = event.item
    if (['plan', 'plan_update', 'planUpdate', 'todo_list', 'todoList'].includes(item.type)) return
    const id = item.id || `${item.type}-${Date.now()}`
    const changes = ['file_change', 'fileChange'].includes(item.type) ? fileChangeDetails(item) : []
    const additions = changes.reduce((total, change) => total + change.additions, 0)
    const deletions = changes.reduce((total, change) => total + change.deletions, 0)
    const running = ['item.started', 'item.updated'].includes(event.type)
    const command = Array.isArray(item.command) ? item.command.join(' ') : String(item.command || '')
    const target = changes.length === 1 ? changes[0].path : item.path || item.file_path || item.filePath || ''
    const typeLabels = {
      reasoning: running ? t('Thinking through the task', 'กำลังวิเคราะห์งาน') : t('Analysis finished', 'วิเคราะห์งานเสร็จแล้ว'),
      web_search: running ? t(`Searching the web${item.query ? `: ${item.query}` : ''}`, `กำลังค้นเว็บ${item.query ? `: ${item.query}` : ''}`) : t('Web search finished', 'ค้นเว็บเสร็จแล้ว'),
      webSearch: running ? t(`Searching the web${item.query ? `: ${item.query}` : ''}`, `กำลังค้นเว็บ${item.query ? `: ${item.query}` : ''}`) : t('Web search finished', 'ค้นเว็บเสร็จแล้ว'),
      mcp_tool_call: running ? t(`Using ${item.name || 'MCP tool'}`, `กำลังใช้ ${item.name || 'เครื่องมือ MCP'}`) : t(`${item.name || 'MCP tool'} finished`, `${item.name || 'เครื่องมือ MCP'} ทำงานเสร็จแล้ว`),
      mcpToolCall: running ? t(`Using ${item.name || 'MCP tool'}`, `กำลังใช้ ${item.name || 'เครื่องมือ MCP'}`) : t(`${item.name || 'MCP tool'} finished`, `${item.name || 'เครื่องมือ MCP'} ทำงานเสร็จแล้ว`)
    }
    let title
    if (['file_change', 'fileChange'].includes(item.type)) {
      title = target
        ? running ? t(`Editing ${target}`, `กำลังแก้ไข ${target}`) : t(`Edited ${target}`, `แก้ไข ${target} แล้ว`)
        : running ? t(`Editing ${changes.length || ''} files`.replace('  ', ' '), `กำลังแก้ไขไฟล์${changes.length ? ` ${changes.length} ไฟล์` : ''}`) : t(`Edited ${changes.length || ''} files`.replace('  ', ' '), `แก้ไขไฟล์${changes.length ? ` ${changes.length} ไฟล์` : ''}แล้ว`)
    } else if (['command_execution', 'commandExecution'].includes(item.type)) title = activityCommandTitle(command, running)
    else title = typeLabels[item.type] || item.name || item.path || item.type
    const output = item.aggregated_output || item.output || item.text || (item.arguments ? JSON.stringify(item.arguments, null, 2) : '')
    const exitCode = item.exit_code ?? item.exitCode ?? null
    const failed = event.type === 'item.failed' || ['failed', 'error'].includes(String(item.status || '').toLowerCase()) || (exitCode !== null && Number(exitCode) !== 0)
    const status = running ? 'running' : failed ? 'failed' : 'completed'
    const now = Date.now()
    setChatActivity(chatId, items => {
      const index = items.findIndex(value => value.id === id)
      const previous = index >= 0 ? items[index] : null
      const next = { id, type: item.type, title: String(title), command: command.slice(0, 1200), output: String(output).slice(-4000), status, changes, additions, deletions, exitCode, startedAt: previous?.startedAt || now, finishedAt: status === 'running' ? null : now }
      if (index < 0) return [...items.slice(-99), next]
      return items.map((value, position) => position === index ? { ...value, ...next } : value)
    })
  }

  async function addAttachments(event) {
    const selected = Array.from(event.target.files || []).slice(0, Math.max(0, 4 - attachments.length))
    event.target.value = ''
    if (!selected.length || attachmentBusy) return
    setAttachmentBusy(true)
    try {
      for (const file of selected) {
        const extension = file.name.split('.').pop()?.toLowerCase()
        const imageType = /^image\/(png|jpeg|webp)$/i.test(file.type) ? file.type.toLowerCase() : ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[extension]
        const image = Boolean(imageType)
        const video = /^video\/(mp4|webm|quicktime)$/i.test(file.type) || ['mp4', 'webm', 'mov'].includes(extension)
        if (!image && !video) throw new Error(t('Use PNG, JPEG, WebP, MP4, WebM, or MOV files.', 'ใช้ไฟล์ PNG, JPEG, WebP, MP4, WebM หรือ MOV'))
        if (image && file.size > 20 * 1024 * 1024) throw new Error(t('Each image must be 20 MB or smaller.', 'รูปแต่ละไฟล์ต้องมีขนาดไม่เกิน 20 MB'))
        if (video && file.size > 500 * 1024 * 1024) throw new Error(t('Each video must be 500 MB or smaller.', 'วิดีโอแต่ละไฟล์ต้องมีขนาดไม่เกิน 500 MB'))
        const paths = image
          ? [await api.saveAttachment({ name: file.name, type: imageType, data: await file.arrayBuffer() })]
          : await captureVideoFrames(file)
        setAttachments(items => [...items, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, kind: image ? 'image' : 'video', preview: URL.createObjectURL(file), paths }])
      }
    } catch (error) {
      alert(error.message || t('Could not attach this media.', 'แนบสื่อนี้ไม่สำเร็จ'))
    } finally {
      setAttachmentBusy(false)
    }
  }

  async function removeAttachment(id) {
    const target = attachments.find(item => item.id === id)
    if (!target) return
    setAttachments(items => items.filter(item => item.id !== id))
    URL.revokeObjectURL(target.preview)
    await api.removeAttachments(target.paths).catch(() => {})
  }

  async function executeTask(task, chatId) {
    setChatRunning(chatId, true)
    if (chatId === conversationIdRef.current) {
      setEvents(items => items.map(event => event.id === task.id ? { ...event, queued: false } : event))
    }
    setChatActivity(chatId, items => [...items.slice(-99), { id: `task-${task.id}`, type: 'task', title: task.text, output: '', status: 'running', startedAt: Date.now(), finishedAt: null }])
    let completed = false
    let snapshot = null
    try {
      if (task.allowEdit) {
        snapshot = await api.undoCreate(task.text)
        setUndoStack(items => [snapshot, ...items].slice(0, 10))
        activeTasksByChat.current.set(chatId, { id: task.id, snapshotId: snapshot.id })
      }
      const result = await api.codexRun({ conversationId: chatId, prompt: task.text, allowEdit: task.allowEdit, sessionId: sessionsByChat.current.get(chatId) || null, attachments: task.attachments, plan: task.plan || [] })
      completed = result.code === 0
      await refreshFiles()
      if (snapshot) await refreshTaskStats(chatId)
    } catch (error) {
      appendChatEvents(chatId, [{ kind: 'error', text: error.message }])
    } finally {
      if (task.attachments?.length) await api.removeAttachments(task.attachments).catch(() => {})
    }
    setChatActivity(chatId, items => items.map(item => item.id === `task-${task.id}` ? { ...item, status: completed ? 'completed' : 'failed', finishedAt: Date.now() } : item))
    activeTasksByChat.current.delete(chatId)
    if (task.planEventId) {
      updatePlanEvent(chatId, event => ({
        ...event,
        status: completed ? 'completed' : 'failed',
        steps: event.steps.map(step => ({ ...step, status: completed ? 'completed' : step.status === 'in_progress' ? 'failed' : step.status }))
      }))
      activePlanByChat.current.delete(chatId)
    }
    advanceQueue(chatId)
  }

  function advanceQueue(chatId) {
    const chatQueue = queuesByChat.current.get(chatId) || []
    const next = chatQueue.shift()
    queuesByChat.current.set(chatId, chatQueue)
    if (chatId === conversationIdRef.current) setQueue([...chatQueue])
    if (next) {
      if (next.needsPlan) void preparePlan(next, chatId)
      else void executeTask(next, chatId)
    } else {
      setChatRunning(chatId, false)
    }
  }

  async function preparePlan(task, chatId) {
    const planEvent = {
      id: `plan-${task.id}`,
      kind: 'plan',
      text: task.text,
      summary: '',
      status: 'generating',
      steps: []
    }
    planStateByChat.current.set(chatId, planEvent)
    appendChatEvents(chatId, [planEvent])
    if (chatId === conversationIdRef.current) setEvents(items => items.map(event => event.id === task.id ? { ...event, queued: false } : event))
    setChatRunning(chatId, true)
    try {
      const result = await api.codexPlan({ conversationId: chatId, prompt: task.text, attachments: task.attachments })
      const ready = { ...planEvent, summary: result.summary, status: 'awaiting', steps: result.steps.map(text => ({ text, status: 'pending' })) }
      planStateByChat.current.set(chatId, ready)
      pendingPlansByChat.current.set(chatId, { task, planEventId: ready.id })
      if (chatId === conversationIdRef.current) setEvents(items => items.map(event => event.id === ready.id ? ready : event))
      else await api.historyUpdateEvent({ conversationId: chatId, event: ready })
      if (task.autoApprove) approvePlan(chatId, ready.id)
      else setChatRunning(chatId, false)
    } catch (error) {
      updatePlanEvent(chatId, event => ({ ...event, status: 'failed', summary: error.message }))
      if (task.attachments?.length) await api.removeAttachments(task.attachments).catch(() => {})
      setChatRunning(chatId, false)
      advanceQueue(chatId)
    }
  }

  function approvePlan(chatId, planEventId) {
    const pending = pendingPlansByChat.current.get(chatId)
    const planEvent = planStateByChat.current.get(chatId)
    if (!pending || !planEvent || pending.planEventId !== planEventId) return
    pendingPlansByChat.current.delete(chatId)
    activePlanByChat.current.set(chatId, planEventId)
    const steps = planEvent.steps.map((step, index) => ({ ...step, status: index === 0 ? 'in_progress' : 'pending' }))
    updatePlanEvent(chatId, event => ({ ...event, status: 'running', steps }))
    void executeTask({ ...pending.task, plan: steps.map(step => step.text), planEventId }, chatId)
  }

  function cancelPlan(chatId, planEventId) {
    const pending = pendingPlansByChat.current.get(chatId)
    if (!pending || pending.planEventId !== planEventId) return
    pendingPlansByChat.current.delete(chatId)
    updatePlanEvent(chatId, event => ({ ...event, status: 'cancelled' }))
    if (pending.task.attachments?.length) void api.removeAttachments(pending.task.attachments)
    advanceQueue(chatId)
  }

  async function sendPrompt() {
    const text = prompt.trim()
    if (!text && attachments.length === 0) return
    if (text.startsWith('/') && attachments.length === 0) {
      setPrompt('')
      void runChatCommand(text)
      return
    }
    if (!project) {
      try {
        await ensureWorkspace()
      } catch (error) {
        addSystemMessage(t(`Could not create the workspace: ${error.message}`, `สร้าง Workspace ไม่สำเร็จ: ${error.message}`))
        return
      }
    }
    const submitted = attachments
    const request = text || t('Analyze the attached media.', 'วิเคราะห์สื่อที่แนบมา')
    const attachmentPaths = submitted.flatMap(item => item.paths)
    const chatId = conversationIdRef.current
    if (!chatId) return
    const task = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: request, allowEdit, attachments: attachmentPaths, needsPlan: true, autoApprove: approvalMode === 'auto' }
    setPrompt('')
    setAttachments([])
    submitted.forEach(item => URL.revokeObjectURL(item.preview))
    const attachmentLabel = submitted.length ? `\n\n${t('Attachments', 'ไฟล์แนบ')}: ${submitted.map(item => item.name).join(', ')}` : ''
    const chatBusy = runningChatsRef.current.has(chatId) || pendingPlansByChat.current.has(chatId)
    setEvents(items => [...items, { id: task.id, kind: 'user', text: `${request}${attachmentLabel}`, queued: chatBusy }])
    if (chatBusy) {
      const chatQueue = queuesByChat.current.get(chatId) || []
      chatQueue.push(task)
      queuesByChat.current.set(chatId, chatQueue)
      setQueue([...chatQueue])
      return
    }
    if (task.needsPlan) void preparePlan(task, chatId)
    else void executeTask(task, chatId)
  }

  function dismissNotice(id) {
    setNotices(items => items.filter(item => item.id !== id))
  }

  function addSystemMessage(text) {
    const id = `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const message = String(text || '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[`*_]/g, '')
      .trim()
    if (!message) return
    setNotices(items => [...items.slice(-2), { id, text: message }])
    window.setTimeout(() => dismissNotice(id), 4500)
  }

  async function runChatCommand(input) {
    const [name, ...args] = input.trim().split(/\s+/)
    const command = name.toLowerCase()
    if (command === '/help') {
      addSystemMessage(`${t('### CodexDesk commands', '### คำสั่ง CodexDesk')}\n${CHAT_COMMANDS.map(item => `- \`${item.name}\` ${settings.language === 'th' ? item.description : item.descriptionEn}`).join('\n')}`)
      return
    }
    if (command === '/new') {
      await newChat()
      return
    }
    if (command === '/clear' || command === '/delete') {
      await clearHistory()
      return
    }
    if (command === '/status') {
      addSystemMessage(settings.language === 'th' ? `### สถานะ\n- โปรเจกต์: **${project?.name || 'ยังไม่ได้เปิด'}**\n- บัญชี: **${authenticated ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}**\n- Codex: **${running ? 'กำลังทำงาน' : 'พร้อมใช้งาน'}**\n- คิว: **${queue.length}**\n- สิทธิ์: **${allowEdit ? 'แก้ไขไฟล์ได้' : 'อ่านอย่างเดียว'}**\n- การอนุมัติ: **${approvalMode === 'ask' ? 'สร้างแผนก่อน' : 'อัตโนมัติ'}**` : `### Status\n- Project: **${project?.name || 'Not open'}**\n- Account: **${authenticated ? 'Connected' : 'Not connected'}**\n- Codex: **${running ? 'Working' : 'Ready'}**\n- Queue: **${queue.length}**\n- Permission: **${allowEdit ? 'Workspace write' : 'Read only'}**\n- Approval: **${approvalMode === 'ask' ? 'Plan first' : 'Automatic'}**`)
      return
    }
    if (command === '/diff') {
      await loadDiff()
      setMobileView('editor')
      addSystemMessage(t('Opened Git Diff.', 'เปิด Git Diff แล้ว'))
      return
    }
    if (command === '/files') {
      setMobileView('files')
      setArtifactView('files')
      return
    }
    if (command === '/code') {
      setMobileView('editor')
      setArtifactView(currentFile ? 'file' : 'files')
      return
    }
    if (command === '/activity') {
      setActivityOpen(true)
      return
    }
    if (command === '/readonly') {
      setAllowEdit(false)
      addSystemMessage(t('Switched to read-only mode.', 'เปลี่ยนเป็นโหมดอ่านอย่างเดียวแล้ว'))
      return
    }
    if (command === '/write') {
      setAllowEdit(true)
      addSystemMessage(t('Workspace write enabled.', 'อนุญาตให้ Codex แก้ไขไฟล์แล้ว'))
      return
    }
    if (command === '/approval') {
      const mode = args[0]?.toLowerCase()
      if (!['ask', 'auto'].includes(mode)) {
        addSystemMessage(t('Use `/approval ask` or `/approval auto`.', 'ใช้ `/approval ask` หรือ `/approval auto`'))
        return
      }
      setApprovalMode(mode)
      addSystemMessage(mode === 'ask' ? t('Approval mode set to create a plan first.', 'ตั้งเป็นสร้างแผนก่อนเริ่มงานแล้ว') : t('Approval mode set to automatic.', 'ตั้งเป็นทำงานอัตโนมัติแล้ว'))
      return
    }
    if (command === '/update') {
      openUpdate()
      addSystemMessage(t('Checking for updates.', 'กำลังตรวจอัปเดต'))
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
        addSystemMessage(t('Use `/search cached`, `/search live`, or `/search off`.', 'ใช้ `/search cached`, `/search live` หรือ `/search off`'))
        return
      }
      await applySettingPatch({ webSearch: value })
      addSystemMessage(value === 'live' ? t('Live web search enabled.', 'เปิดค้นเว็บแบบข้อมูลล่าสุดแล้ว') : value === 'cached' ? t('Cached OpenAI web search enabled.', 'เปิดค้นเว็บผ่านดัชนีของ OpenAI แล้ว') : t('Web search disabled.', 'ปิดการค้นเว็บแล้ว'))
      return
    }
    if (command === '/personality') {
      const value = args[0]?.toLowerCase()
      if (!['pragmatic', 'friendly', 'none'].includes(value)) {
        addSystemMessage(t('Use `/personality pragmatic`, `/personality friendly`, or `/personality none`.', 'ใช้ `/personality pragmatic`, `/personality friendly` หรือ `/personality none`'))
        return
      }
      await applySettingPatch({ personality: value })
      addSystemMessage(t(`Personality set to **${value}**.`, `ตั้งบุคลิกเป็น **${value}** แล้ว`))
      return
    }
    if (command === '/stop') {
      stopCodex()
      addSystemMessage(t('Stopped the task and cleared the queue.', 'หยุดงานและล้างคิวแล้ว'))
      return
    }
    addSystemMessage(t(`Unknown command \`${name}\`. Type \`/help\` to see all commands.`, `ไม่พบคำสั่ง \`${name}\` พิมพ์ \`/help\` เพื่อดูคำสั่งทั้งหมด`))
  }

  function stopCodex() {
    const chatId = conversationIdRef.current
    if (!chatId) return
    const chatQueue = queuesByChat.current.get(chatId) || []
    const pendingAttachments = chatQueue.flatMap(task => task.attachments || [])
    queuesByChat.current.set(chatId, [])
    setQueue([])
    if (pendingAttachments.length) void api.removeAttachments(pendingAttachments)
    api.codexStop(chatId)
  }

  function applyConversation(history) {
    conversationIdRef.current = history.conversationId
    sessionsByChat.current.set(history.conversationId, history.sessionId || null)
    sessionIdRef.current = history.sessionId || null
    setSessionId(history.sessionId || null)
    setConversationId(history.conversationId)
    const nextEvents = (history.events || []).filter(event => event.kind !== 'system').map(event => {
      if (event.kind !== 'plan') return { ...event, queued: false }
      const resumable = pendingPlansByChat.current.has(history.conversationId) || activePlanByChat.current.has(history.conversationId) || runningChatsRef.current.has(history.conversationId)
      if (!resumable && ['generating', 'awaiting', 'running'].includes(event.status)) return { ...event, status: 'cancelled' }
      return event
    })
    const latestPlan = nextEvents.filter(event => event.kind === 'plan').at(-1)
    if (latestPlan) planStateByChat.current.set(history.conversationId, latestPlan)
    else planStateByChat.current.delete(history.conversationId)
    setEvents(nextEvents)
    setActivity(activitiesByChat.current.get(history.conversationId) || [])
    setQueue([...(queuesByChat.current.get(history.conversationId) || [])])
  }

  async function newChat() {
    const previousId = conversationIdRef.current
    setHistoryReady(false)
    try {
      if (!project) await ensureWorkspace()
      conversationIdRef.current = null
      await api.historySave({ conversationId, events, sessionId }).catch(() => {})
      const history = await api.historyNew()
      applyConversation(history)
      setConversations(await api.historyList())
    } catch (error) {
      conversationIdRef.current = previousId
      addSystemMessage(t(`Could not create a new chat: ${error.message}`, `สร้างแชทใหม่ไม่สำเร็จ: ${error.message}`))
    } finally {
      setHistoryOpen(false)
      setActivityOpen(false)
      setMobileView('chat')
      setHistoryReady(true)
      window.requestAnimationFrame(() => promptInput.current?.focus())
    }
  }

  async function openConversation(id) {
    if (id === conversationIdRef.current) {
      setHistoryOpen(false)
      setActivityOpen(false)
      setMobileView('chat')
      window.requestAnimationFrame(() => promptInput.current?.focus())
      return
    }
    const previousId = conversationIdRef.current
    setHistoryReady(false)
    try {
      conversationIdRef.current = null
      await api.historySave({ conversationId, events, sessionId }).catch(() => {})
      const history = await api.historyOpen(id)
      applyConversation(history)
      setConversations(await api.historyList())
    } catch (error) {
      conversationIdRef.current = previousId
      addSystemMessage(t(`Could not open this chat: ${error.message}`, `เปิดแชทนี้ไม่สำเร็จ: ${error.message}`))
    } finally {
      setHistoryOpen(false)
      setActivityOpen(false)
      setMobileView('chat')
      setHistoryReady(true)
      window.requestAnimationFrame(() => promptInput.current?.focus())
    }
  }

  async function clearHistory() {
    if (running || !confirm(t('Delete this chat? This cannot be undone.', 'ลบแชทนี้หรือไม่ การลบไม่สามารถย้อนกลับได้'))) return
    setHistoryReady(false)
    const history = await api.historyClear(conversationId)
    applyConversation(history)
    setConversations(await api.historyList())
    setHistoryReady(true)
  }

  async function deleteConversation(id) {
    if (runningChatsRef.current.has(id) || !id || !confirm(t('Delete this chat? This cannot be undone.', 'ลบแชทนี้หรือไม่ การลบไม่สามารถย้อนกลับได้'))) return
    const deletingCurrent = id === conversationId
    if (deletingCurrent) setHistoryReady(false)
    try {
      const history = await api.historyClear(id)
      if (deletingCurrent) applyConversation(history)
      setConversations(await api.historyList())
    } finally {
      if (deletingCurrent) setHistoryReady(true)
    }
  }

  async function copyChat() {
    const transcript = events.filter(event => event.kind !== 'system').map(event => `${event.kind === 'user' ? t('You', 'คุณ') : 'Codex'}\n${event.text}`).join('\n\n')
    await api.copyText(transcript)
    addSystemMessage(t('Copied the full chat.', 'คัดลอกแชททั้งหมดแล้ว'))
  }

  async function undoLastTask() {
    const snapshot = undoStack[0]
    if (!snapshot || running) return
    if (!confirm(t(`Restore all files to before "${snapshot.label || 'the latest task'}"?`, `ย้อนกลับไฟล์ทั้งหมดไปก่อนงาน "${snapshot.label || 'ล่าสุด'}" หรือไม่`))) return
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
      addSystemMessage(t('Restored files to before the latest task.', 'ย้อนกลับไฟล์ไปก่อนงานล่าสุดแล้ว'))
    } catch (error) {
      addSystemMessage(t(`Undo failed: ${error.message}`, `ย้อนกลับไม่สำเร็จ: ${error.message}`))
    }
  }

  async function signOut() {
    if (!authenticated || hasRunningChats) return
    if (!confirm(t('Sign out of ChatGPT in CodexDesk?', 'ออกจากระบบ ChatGPT ใน CodexDesk หรือไม่'))) return
    try {
      await api.authLogout()
      setAuthenticated(false)
      setAuthOpen(false)
      addSystemMessage(t('Signed out of ChatGPT.', 'ออกจากระบบ ChatGPT แล้ว'))
    } catch (error) {
      addSystemMessage(t(`Sign out failed: ${error.message}`, `ออกจากระบบไม่สำเร็จ: ${error.message}`))
    }
  }

  function clampArtifactWidth(value) {
    const sidebarWidth = window.innerWidth > 1180 ? 270 : 230
    const maximum = Math.max(320, window.innerWidth - sidebarWidth - 360)
    return Math.max(320, Math.min(maximum, Math.round(value)))
  }

  function resizeArtifactBy(delta) {
    setArtifactWidth(current => {
      const next = clampArtifactWidth(current + delta)
      window.localStorage.setItem('codexdesk-artifact-width', String(next))
      return next
    })
  }

  function startArtifactResize(event) {
    if (event.button !== 0 || window.innerWidth <= 900) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = artifactWidth
    const move = pointerEvent => setArtifactWidth(clampArtifactWidth(startWidth + startX - pointerEvent.clientX))
    const stop = pointerEvent => {
      const next = clampArtifactWidth(startWidth + startX - pointerEvent.clientX)
      setArtifactWidth(next)
      window.localStorage.setItem('codexdesk-artifact-width', String(next))
      document.documentElement.classList.remove('resizing-artifact')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    document.documentElement.classList.add('resizing-artifact')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const language = useMemo(() => {
    const extension = currentFile?.name.split('.').pop()?.toLowerCase()
    return ({ js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', json: 'json', html: 'html', css: 'css', cs: 'csharp', java: 'java', go: 'go', rs: 'rust', md: 'markdown', yml: 'yaml', yaml: 'yaml' })[extension] || 'plaintext'
  }, [currentFile])

  return <div className={`app-shell theme-${settings.theme} density-${settings.density} ${lightTheme ? 'is-light' : ''}`}>
    <header className="titlebar">
      <div className="brand"><div className="brand-mark"><Code2 size={15} /></div><div className="brand-copy"><span>CodexDesk</span><small>AI CODE WORKSPACE</small></div></div>
      <button className="project-switcher" onClick={openProject}><FolderOpen size={15} /><span>{project?.name || t('Open project', 'เปิดโปรเจกต์')}</span><ChevronDown size={13} /></button>
      <div className="title-actions">
        <button className={`update-button ${updater.status}`} onClick={openUpdate}>{updater.status === 'downloaded' || updater.status === 'available' ? <Download size={13} /> : <RefreshCw size={13} />}<span>{updateLabel}</span></button>
        <button className={`account-button ${authenticated ? 'connected' : ''}`} onClick={openAccount}>{authenticated ? <Check size={13} /> : <LogIn size={13} />}<span>{authenticated ? t('Connected', 'เชื่อมต่อแล้ว') : t('Connect ChatGPT', 'เชื่อมต่อ ChatGPT')}</span></button>
        <span className={`status-dot ${hasRunningChats ? 'active' : ''}`} /><span>{hasRunningChats ? t('Working', 'กำลังทำงาน') : t('Ready', 'พร้อมใช้งาน')}</span>
      </div>
    </header>

    <main className={`workspace view-${mobileView} ${artifactView ? 'artifact-open' : ''}`} style={{ '--artifact-width': `${artifactWidth}px` }}>
      <aside className="chat-sidebar">
        <div className="sidebar-logo"><span><Code2 size={16} /></span><strong>CodexDesk</strong></div>
        <button className="sidebar-new" onClick={newChat}><FilePenLine size={16} /><span>{t('New chat', 'แชทใหม่')}</span><Plus size={14} /></button>
        <nav className="sidebar-nav">
          <button className="active" onClick={() => setMobileView('chat')}><Bot size={16} /><span>Codex</span></button>
          <button onClick={() => { setArtifactView('files'); setMobileView('files') }}><FolderOpen size={16} /><span>{t('Files', 'ไฟล์')}</span></button>
          <button onClick={() => void loadDiff()}><GitCompare size={16} /><span>{t('Changes', 'การเปลี่ยนแปลง')}</span></button>
          <button onClick={openMcp}><Plug size={16} /><span>{t('Plugins', 'ปลั๊กอิน')}</span></button>
        </nav>
        <div className="sidebar-recents"><div className="sidebar-section-title"><span>{t('Recents', 'ล่าสุด')}</span><Search size={13} /></div><div className="sidebar-history">{conversations.map(item => <div className={`sidebar-history-item ${item.conversationId === conversationId ? 'active' : ''} ${runningChats[item.conversationId] ? 'running' : ''}`} key={item.conversationId}><button onClick={() => openConversation(item.conversationId)}><span>{item.title}</span></button><button onClick={() => deleteConversation(item.conversationId)} disabled={Boolean(runningChats[item.conversationId])} title={t('Delete chat', 'ลบแชท')}><Trash2 size={12} /></button></div>)}{conversations.length === 0 && <div className="sidebar-empty">{t('No chats yet', 'ยังไม่มีแชท')}</div>}</div></div>
        <div className="sidebar-footer">
          <div className={`weekly-limit ${weeklyUsage.status}`} aria-live="polite">
            <div className="weekly-limit-heading"><strong>{t('Weekly limit', 'ขีดจำกัดรายสัปดาห์')}</strong><span>{weeklyStatusLabel}</span></div>
            <div className="weekly-limit-track"><i style={{ width: `${weeklyRemaining}%` }} /></div>
            <div className="weekly-limit-meta"><small>{weeklyMetaLabel}</small><button onClick={() => void refreshWeeklyUsage()} disabled={!authenticated || weeklyUsage.status === 'loading'} title={t('Refresh usage', 'รีเฟรชการใช้งาน')}><RefreshCw size={11} /></button></div>
          </div>
          <button onClick={openProject}><FolderOpen size={16} /><span><strong>{project?.name || t('Open project', 'เปิดโปรเจกต์')}</strong><small>{t('Choose workspace', 'เลือกพื้นที่ทำงาน')}</small></span><ChevronRight size={14} /></button>
          <button onClick={() => openSettings()}><SettingsIcon size={16} /><span>{t('Settings', 'การตั้งค่า')}</span></button>
          <button onClick={openAccount}>{authenticated ? <Check size={16} /> : <LogIn size={16} />}<span>{authenticated ? t('ChatGPT connected', 'เชื่อมต่อ ChatGPT แล้ว') : t('Connect ChatGPT', 'เชื่อมต่อ ChatGPT')}</span></button>
        </div>
      </aside>

      <aside className={`artifact-panel ${artifactView ? 'open' : ''}`}>
        <div className="artifact-resizer" role="separator" aria-label={t('Resize right panel', 'ปรับขนาดแผงขวา')} aria-orientation="vertical" tabIndex={0} onPointerDown={startArtifactResize} onDoubleClick={() => resizeArtifactBy(480 - artifactWidth)} onKeyDown={event => { if (event.key === 'ArrowLeft') resizeArtifactBy(24); if (event.key === 'ArrowRight') resizeArtifactBy(-24) }} />
        <div className="artifact-heading"><div className="artifact-tabs">{currentPlan && <button className={artifactView === 'plan' ? 'active' : ''} onClick={() => setArtifactView('plan')}><ListTodo size={13} />Plan</button>}<button className={artifactView === 'files' ? 'active' : ''} onClick={() => setArtifactView('files')}><FolderOpen size={13} />{t('Files', 'ไฟล์')}</button>{currentFile && <button className={artifactView === 'file' ? 'active' : ''} onClick={() => setArtifactView('file')}><Code2 size={13} />{currentFile.name}</button>}<button className={artifactView === 'diff' ? 'active' : ''} onClick={() => void loadDiff()}><GitCompare size={13} />{t('Changes', 'การเปลี่ยนแปลง')}</button>{responseArtifact && <button className={artifactView === 'response' ? 'active' : ''} onClick={() => setArtifactView('response')}>{responseArtifact.type === 'code' ? <Code2 size={13} /> : <File size={13} />}{responseArtifact.type === 'code' ? 'Code' : 'Text'}</button>}</div><button className="artifact-close" onClick={() => setArtifactView(null)} title={t('Close panel', 'ปิดแผง')}><X size={15} /></button></div>
        {artifactView === 'plan' && currentPlan && <div className="artifact-plan"><PlanCard event={currentPlan} canDecide={pendingPlansByChat.current.get(conversationId)?.planEventId === currentPlan.id} onApprove={() => approvePlan(conversationId, currentPlan.id)} onCancel={() => cancelPlan(conversationId, currentPlan.id)} translate={t} /></div>}
        {artifactView === 'files' && <div className="artifact-files"><div className="project-label"><FolderOpen size={13} /><span>{project?.name || t('No project open', 'ยังไม่ได้เปิดโปรเจกต์')}</span><button onClick={refreshFiles}><RefreshCw size={13} /></button></div><label className="file-search"><Search size={13} /><input value={fileQuery} onChange={event => setFileQuery(event.target.value)} placeholder={t('Search files', 'ค้นหาไฟล์')} /></label><div className="file-tree">{visibleFiles.map(node => <FileNode key={node.path} node={node} onOpen={openFile} />)}{visibleFiles.length === 0 && <div className="file-empty">{project ? t('No files found', 'ไม่พบไฟล์') : t('Open a project to browse files', 'เปิดโปรเจกต์เพื่อดูไฟล์')}</div>}</div></div>}
        {artifactView === 'file' && currentFile && <div className="artifact-editor"><div className="artifact-toolbar"><span><File size={13} />{currentFile.name}</span><button disabled={!dirty} onClick={saveFile}><Save size={13} />{t('Save', 'บันทึก')}</button></div><div className="editor-wrap"><Suspense fallback={<div className="editor-loading">{t('Loading editor…', 'กำลังโหลดตัวแก้โค้ด…')}</div>}><CodeEditor value={content} onChange={value => setContent(value ?? '')} onMount={mountEditor} language={language} theme={lightTheme ? 'vs' : 'vs-dark'} options={{ minimap: { enabled: false }, stickyScroll: { enabled: false }, bracketPairColorization: { enabled: false }, overviewRulerLanes: 0, hideCursorInOverviewRuler: true, fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 13, padding: { top: 14 }, smoothScrolling: false, cursorSmoothCaretAnimation: 'off', renderLineHighlight: 'line', wordWrap: 'off', automaticLayout: true }} /></Suspense></div><div className="editor-status"><span>{language.toUpperCase()}</span><span>{dirty ? t('Unsaved', 'ยังไม่ได้บันทึก') : t('Saved', 'บันทึกแล้ว')}</span><span>UTF-8</span></div></div>}
        {artifactView === 'diff' && <div className="artifact-diff"><div className="artifact-toolbar"><span><GitCompare size={13} />Git Diff</span><button onClick={loadDiff}><RefreshCw size={13} />{t('Refresh', 'รีเฟรช')}</button></div><pre>{diff || t('Codex changes will appear here', 'การเปลี่ยนแปลงของ Codex จะแสดงที่นี่')}</pre></div>}
        {artifactView === 'response' && responseArtifact && <div className="response-artifact"><div className="artifact-toolbar"><span>{responseArtifact.type === 'code' ? <Code2 size={13} /> : <File size={13} />}{responseArtifact.language.toUpperCase()}</span><button onClick={() => api.copyText(responseArtifact.content)}><Copy size={13} />{t('Copy', 'คัดลอก')}</button></div><pre><code>{responseArtifact.content}</code></pre></div>}
      </aside>

      <aside className="agent-panel">
        <div className="agent-heading"><div><Bot size={17} /><span>Codex</span></div><div className="agent-actions"><button className="icon-action" onClick={newChat} title={t('New chat', 'แชทใหม่')}><Plus size={14} /></button><button className={`icon-action ${historyOpen ? 'active' : ''}`} onClick={() => { setHistoryOpen(value => !value); setActivityOpen(false) }} title={t('Chat history', 'ประวัติแชท')}><History size={14} /></button><button className="icon-action" disabled={events.length === 0} onClick={copyChat} title={t('Copy full chat', 'คัดลอกแชททั้งหมด')}><Copy size={14} /></button><button className="icon-action" disabled={running || undoStack.length === 0} onClick={undoLastTask} title={t('Undo latest task', 'ย้อนกลับงานล่าสุด')}><Undo2 size={14} /></button><button className={activityOpen ? 'active' : ''} onClick={() => { setActivityOpen(value => !value); setHistoryOpen(false) }} title="Left Ctrl + O"><ListTodo size={15} />{t('Activity', 'กิจกรรม')}{queue.length > 0 && <b>{queue.length}</b>}</button><button disabled={!running} onClick={stopCodex}><CircleStop size={15} />{t('Stop', 'หยุด')}</button></div></div>
        <div className="agent-meta"><span>Local workspace</span><span>{allowEdit ? 'Workspace write' : 'Read only'}</span></div>
        <div className="conversation">
          {events.length === 0 && <div className="welcome"><span className="welcome-kicker">CODEX WORKSPACE</span><div className="welcome-icon"><Bot size={22} /></div><h2>{t('What would you like to build?', 'วันนี้ต้องการสร้างอะไร')}</h2><p>{t('Ask Codex to create, inspect, or edit code. No folder is required.', 'สั่งให้ Codex สร้าง อ่าน ตรวจสอบ หรือแก้ไขงานได้โดยไม่ต้องเปิดโฟลเดอร์')}</p><div className="welcome-actions"><button onClick={() => setPrompt(t('Inspect this project and summarize improvements', 'ตรวจสอบโครงสร้างโปรเจกต์และสรุปสิ่งที่ควรปรับปรุง'))}><Search size={13} /><span>{t('Inspect project', 'ตรวจโปรเจกต์')}</span></button><button onClick={() => setPrompt(t('Find potential bugs and fix them safely', 'ค้นหาบัคที่อาจเกิดขึ้นและแก้ไขให้ปลอดภัย'))}><ShieldCheck size={13} /><span>{t('Find bugs', 'ค้นหาบัค')}</span></button><button onClick={() => setPrompt(t('Create a new project for me. Ask only for essential requirements.', 'สร้างโปรเจกต์ใหม่ให้ฉัน ถามเฉพาะข้อมูลที่จำเป็น'))}><Code2 size={13} /><span>{t('New project', 'สร้างโปรเจกต์')}</span></button></div></div>}
          {events.filter(event => event.kind !== 'system' && event.kind !== 'plan').map((event, index) => <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} key={event.id || index} className={`message ${event.kind} ${event.queued ? 'queued' : ''}`}><div className="message-label"><span>{event.kind === 'user' ? event.queued ? t('You · queued', 'คุณ · อยู่ในคิว') : t('You', 'คุณ') : 'Codex'}</span><button onClick={() => api.copyText(event.text)} title={t('Copy message', 'คัดลอกข้อความ')}><Copy size={11} /></button></div><div className="markdown"><MarkdownMessage onOpenFile={openFileLink} text={event.text} translate={t} /></div></motion.div>)}
          {running && <div className="thinking"><i /><i /><i /></div>}
          <div ref={conversationEnd} className="conversation-end" />
        </div>
        {running && <div className="live-status"><div><i /><span>{liveActivity?.title || t('Starting task', 'กำลังเริ่มงาน')}</span></div>{(liveStats.additions > 0 || liveStats.deletions > 0) && <strong><b>+{liveStats.additions}</b><em>-{liveStats.deletions}</em></strong>}</div>}
        <AnimatePresence>{historyOpen && <motion.div className="activity-drawer history-drawer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
          <div className="activity-heading"><div><History size={15} /><span>{t('Chat history', 'ประวัติแชท')}</span></div><button className="new-chat-button" onClick={newChat}><Plus size={13} />{t('New chat', 'แชทใหม่')}</button></div>
          <div className="history-list">{conversations.map(item => <div className={`history-item ${item.conversationId === conversationId ? 'active' : ''} ${runningChats[item.conversationId] ? 'running' : ''}`} key={item.conversationId}><button className="history-open" onClick={() => openConversation(item.conversationId)}><span className="history-chat-title"><i />{item.title}</span><time>{new Date(item.updatedAt).toLocaleString(settings.language === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</time></button><button className="history-delete" onClick={() => deleteConversation(item.conversationId)} disabled={Boolean(runningChats[item.conversationId])} title={t('Delete chat', 'ลบแชท')}><Trash2 size={13} /></button></div>)}</div>
        </motion.div>}</AnimatePresence>
        <AnimatePresence>{activityOpen && <motion.div className="activity-drawer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
          <div className="activity-heading"><div><ListTodo size={15} /><span>{t('Codex activity', 'กิจกรรมของ Codex')}</span></div><div className="activity-heading-actions"><kbd>Ctrl + O</kbd><button onClick={clearHistory} title={t('Clear chat', 'ล้างประวัติแชท')}><Trash2 size={13} /></button></div></div>
          {queue.length > 0 && <div className="queue-section"><strong>{t('Message queue', 'คิวข้อความ')} {queue.length}</strong>{queue.map((task, index) => <div className="queue-item" key={task.id}><span>{index + 1}</span><p>{task.text}</p></div>)}</div>}
          <div className="activity-list">{activity.length === 0 ? <div className="activity-empty">{t('No activity yet', 'ยังไม่มีกิจกรรม')}</div> : activity.slice().reverse().map(item => <ActivityLogItem item={item} translate={t} key={item.id} />)}</div>
        </motion.div>}</AnimatePresence>
        <div className="composer">
          {commandSuggestions.length > 0 && <div className="command-menu"><div className="command-menu-label"><Command size={12} />{t('Commands', 'คำสั่ง')}</div>{commandSuggestions.map(command => <button key={command.name} onClick={() => setPrompt(command.name === '/approval' ? '/approval ' : command.name)}><code>{command.name}</code><span>{settings.language === 'th' ? command.description : command.descriptionEn}</span></button>)}</div>}
          <input ref={attachmentInput} className="attachment-input" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={addAttachments} />
          {(attachments.length > 0 || attachmentBusy) && <div className="attachment-strip">{attachments.map(item => <div className="attachment-card" key={item.id}>{item.kind === 'image' ? <img src={item.preview} alt="" /> : <video src={item.preview} muted preload="metadata" />}<span>{item.kind === 'image' ? <ImageIcon size={11} /> : <Video size={11} />}{item.name}</span><button onClick={() => removeAttachment(item.id)} title={t('Remove attachment', 'ลบไฟล์แนบ')}><X size={11} /></button></div>)}{attachmentBusy && <div className="attachment-processing"><i />{t('Processing media', 'กำลังประมวลผลสื่อ')}</div>}</div>}
          <textarea ref={promptInput} value={prompt} onFocus={() => { setHistoryOpen(false); setActivityOpen(false) }} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { const send = settings.sendMode === 'ctrl-enter' ? event.key === 'Enter' && event.ctrlKey : event.key === 'Enter' && !event.shiftKey; if (send) { event.preventDefault(); void sendPrompt() } }} placeholder={project ? t('Ask Codex…', 'สั่งงาน Codex…') : t('Ask Codex to create something new…', 'สั่งให้ Codex สร้างงานใหม่…')} />
          {queue.length > 0 && <div className="queue-indicator">{t(`${queue.length} message${queue.length === 1 ? '' : 's'} waiting`, `มี ${queue.length} ข้อความรอทำงาน`)}</div>}
          <div className="composer-footer">
            <div className="composer-options">
              <button className="attach-button" onClick={() => attachmentInput.current?.click()} disabled={attachmentBusy || attachments.length >= 4} title={t('Attach image or video', 'แนบรูปหรือวิดีโอ')}><Paperclip size={13} />{attachments.length > 0 && <b>{attachments.length}</b>}</button>
              <button className="permission" onClick={() => setAllowEdit(value => !value)}><span className={allowEdit ? 'enabled' : ''} />{allowEdit ? t('Workspace write', 'แก้ไขไฟล์ได้') : t('Read only', 'อ่านอย่างเดียว')}</button>
              <button className="approval-mode" onClick={() => setApprovalMode(value => value === 'ask' ? 'auto' : 'ask')} title={t('Approval mode', 'รูปแบบการอนุมัติ')}><ShieldCheck size={13} />{approvalMode === 'ask' ? t('Plan first', 'สร้างแผนก่อน') : t('Automatic', 'อัตโนมัติ')}</button>
              <button className="model-chip" onClick={() => openSettings('model')} title={t('Choose model and reasoning', 'เลือกโมเดลและระดับการคิด')}><Brain size={13} />{settings.model ? settings.model.replace('gpt-', '') : 'Auto'} · {settings.reasoningEffort}</button>
            </div>
            <button className="send-button" onClick={() => void sendPrompt()} disabled={attachmentBusy || (!prompt.trim() && attachments.length === 0)}><Send size={15} /></button>
          </div>
        </div>
      </aside>
    </main>
    <div className="notice-stack" aria-live="polite">
      <AnimatePresence initial={false}>{notices.map(notice => <motion.div className="notice-toast" key={notice.id} initial={{ opacity: 0, x: 24, scale: .97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 18, scale: .98 }} transition={{ type: 'spring', stiffness: 460, damping: 36 }}><Info size={15} /><p>{notice.text}</p><button onClick={() => dismissNotice(notice.id)} title={t('Dismiss notification', 'ปิดการแจ้งเตือน')}><X size={13} /></button></motion.div>)}</AnimatePresence>
    </div>
    <AnimatePresence>{settingsOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <SettingsModal authenticated={authenticated} currentVersion={currentVersion} draft={settingsDraft} onChange={setSettingsDraft} onClearData={clearLocalData} onClose={() => setSettingsOpen(false)} onOpenMcp={() => { setSettingsOpen(false); void openMcp() }} onSave={saveSettings} onSignOut={signOut} onUpdate={() => { setSettingsOpen(false); openUpdate() }} saving={settingsSaving} section={settingsSection} setSection={setSettingsSection} />
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{mcpOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="mcp-modal" initial={{ opacity: 0, scale: .97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <div className="mcp-heading"><div><span className="mcp-symbol"><Plug size={17} /></span><div><h2>{t('MCP plugins', 'ปลั๊กอิน MCP')}</h2><p>{t('Connect external tools to Codex', 'เชื่อมเครื่องมือภายนอกเข้ากับ Codex')}</p></div></div><div><button className="mcp-add" onClick={() => setMcpFormOpen(value => !value)}><Plus size={13} />{t('Add custom', 'เพิ่มเอง')}</button><button className="modal-close static" onClick={() => setMcpOpen(false)}><X size={16} /></button></div></div>
        <div className="mcp-content">
          <section className="mcp-presets"><span className="mcp-section-label">{t('Quick install', 'ติดตั้งด่วน')}</span><div>{MCP_PRESETS.map(preset => { const installed = mcpServers.some(server => server.name === preset.name); return <button key={preset.name} disabled={installed || mcpBusy || hasRunningChats} onClick={() => installPreset(preset)}><span><Server size={15} /></span><div><strong>{preset.label}</strong><small>{settings.language === 'th' ? preset.description : preset.descriptionEn}</small></div><i>{installed ? t('Installed', 'ติดตั้งแล้ว') : t('Install', 'ติดตั้ง')}</i></button> })}</div></section>
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
        <h2>{updater.status === 'available' ? t(`Version ${updater.version} is available`, `พร้อมอัปเดตเป็น ${updater.version}`) : updater.status === 'downloaded' ? t('Ready to install', 'พร้อมติดตั้งอัปเดต') : updater.status === 'installing' ? t('Opening the installer', 'กำลังเปิดหน้าติดตั้ง') : updater.status === 'current' ? t('CodexDesk is up to date', 'เป็นเวอร์ชันล่าสุดแล้ว') : updater.status === 'error' ? t('Update check failed', 'ตรวจสอบอัปเดตไม่สำเร็จ') : updater.status === 'downloading' ? t('Downloading update', 'กำลังดาวน์โหลดอัปเดต') : t('Checking for updates', 'กำลังตรวจสอบอัปเดต')}</h2>
        <p>{updater.status === 'downloaded' ? t('The installer will appear after CodexDesk closes.', 'หน้าติดตั้งจะแสดงหลัง CodexDesk ปิด') : updater.status === 'installing' ? t('Continue in the installer window. Chat history and settings will be preserved.', 'ติดตั้งต่อในหน้าต่างที่กำลังเปิด ประวัติแชทและการตั้งค่าจะไม่ถูกลบ') : updater.status === 'available' ? t('The update downloads only after you confirm.', 'ดาวน์โหลดเมื่อคุณกดยืนยันเท่านั้น') : updater.status === 'current' ? t('There is no newer version to install.', 'ยังไม่มีเวอร์ชันใหม่สำหรับติดตั้ง') : updater.status === 'error' && updater.error === 'timeout' ? t('GitHub did not respond within 25 seconds. Try again or open the release page.', 'GitHub ไม่ตอบกลับภายใน 25 วินาที กรุณาลองใหม่หรือเปิดหน้าดาวน์โหลด') : updater.status === 'error' ? t('Check your internet connection and try again.', 'ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง') : t('Connecting to GitHub Releases', 'กำลังเชื่อมต่อกับ GitHub Releases')}</p>
        <div className="update-progress"><i style={{ width: updater.status === 'downloading' ? `${updater.percent}%` : ['downloaded', 'installing', 'current'].includes(updater.status) ? '100%' : updater.status === 'available' ? '35%' : '12%' }} /></div>
        <div className="update-stages"><span className="done"><i><Check size={10} /></i>{t('Installed', 'ติดตั้งแล้ว')}</span><span className={['available', 'downloading', 'downloaded', 'installing'].includes(updater.status) ? 'done' : ''}><i>{['available', 'downloading', 'downloaded', 'installing'].includes(updater.status) ? <Check size={10} /> : '2'}</i>{t('Download', 'ดาวน์โหลด')}</span><span className={['downloaded', 'installing'].includes(updater.status) ? 'done' : ''}><i>{['downloaded', 'installing'].includes(updater.status) ? <Check size={10} /> : '3'}</i>{t('Replace', 'ติดตั้งใหม่')}</span></div>
        <div className="update-details"><span>{t('Current version', 'เวอร์ชันปัจจุบัน')}</span><strong>{currentVersion || t('Checking', 'กำลังตรวจสอบ')}</strong><span>{t('New version', 'เวอร์ชันใหม่')}</span><strong>{updater.version || t('Checking', 'กำลังตรวจสอบ')}</strong></div>
        {updater.notes && <div className="update-notes"><strong>{t('Release notes', 'รายการเปลี่ยนแปลง')}</strong><p>{updater.notes}</p></div>}
        <button className="update-primary" onClick={updateApp} disabled={['checking', 'downloading', 'installing'].includes(updater.status)}>{updater.status === 'available' ? t('Download update', 'ดาวน์โหลดอัปเดต') : updater.status === 'downloaded' ? t('Open installer', 'เปิดหน้าติดตั้ง') : updater.status === 'installing' ? t('Opening installer', 'กำลังเปิดหน้าติดตั้ง') : updater.status === 'current' ? t('Check again', 'ตรวจสอบอีกครั้ง') : updater.status === 'error' ? t('Try again', 'ลองอีกครั้ง') : updater.status === 'downloading' ? t(`Downloading ${updater.percent}%`, `ดาวน์โหลด ${updater.percent}%`) : t('Checking', 'กำลังตรวจสอบ')}</button>
        {updater.status === 'error' && <button className="update-manual" onClick={() => api.openLink('https://github.com/nidvjj-sudo/CodexDesk/releases/latest')}><ExternalLink size={13} />{t('Open download page', 'เปิดหน้าดาวน์โหลด')}</button>}
        <button className="uninstall-button" onClick={uninstallApp}>{t('Uninstall CodexDesk', 'ถอนการติดตั้ง CodexDesk')}</button>
        <span className="update-note">{t('CodexDesk never downloads or installs updates automatically', 'CodexDesk จะไม่ดาวน์โหลดหรือติดตั้งเอง')}</span>
      </motion.div>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{authOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="auth-modal" initial={{ opacity: 0, scale: .96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <button className="modal-close" onClick={() => setAuthOpen(false)}><X size={16} /></button>
        <div className={`auth-symbol ${authState}`}><LogIn size={21} /></div>
        <h2>{authState === 'success' ? t('Signed in', 'เข้าสู่ระบบสำเร็จ') : authMode === 'browser' ? t('Sign in with ChatGPT', 'เข้าสู่ระบบด้วย ChatGPT') : t('Sign in with a device code', 'เข้าสู่ระบบด้วยรหัสยืนยัน')}</h2>
        {authState === 'success' ? <><p>{t('Your ChatGPT account is ready to use with CodexDesk.', 'บัญชี ChatGPT พร้อมใช้งานกับ CodexDesk แล้ว')}</p><button className="auth-secondary logout-button" onClick={signOut} disabled={hasRunningChats}><LogOut size={14} />{t('Sign out', 'ออกจากระบบ')}</button></> : <>
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
