import React, { useState, useEffect } from 'react'
import { Bell, Mail, Send, MessageSquare, Plus, Edit2, Trash2, ChevronDown, ChevronUp, CheckCircle, AlertOctagon, RotateCcw } from 'lucide-react'
import { apiFetch, apiPost } from '../api'
import { useAuth } from '../context/AuthContext'
import { usePolling } from '../hooks/usePolling'
import { StatusMessage } from '../components/shared/StatusMessage'

export const AlertsView: React.FC = () => {
  const { isAdmin } = useAuth()

  const [stats, setStats] = useState<any>({})
  const [rules, setRules] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [tplOpen, setTplOpen] = useState(false)

  // Configs
  const [email, setEmail] = useState<any>({ smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', from_addr: '', use_tls: true, enabled: false })
  const [telegram, setTelegram] = useState<any>({ bot_token: '', chat_id: '', enabled: false })
  const [discord, setDiscord] = useState<any>({ webhook_url: '', enabled: false })
  const [tpl, setTpl] = useState<any>({ subject: '', body: '' })

  // Rule Form
  const [newRule, setNewRule] = useState<any>({ name: '', source_type: 'syslog', host_match: '', exclude_hosts: '', text_match: '', to_email: '' })
  const [notifyVia, setNotifyVia] = useState<string[]>(['email'])
  const [editRule, setEditRule] = useState<any | null>(null)

  // Status messages
  const [emailMsg, setEmailMsg] = useState({ text: '', ok: false })
  const [tgMsg, setTgMsg] = useState({ text: '', ok: false })
  const [dcMsg, setDcMsg] = useState({ text: '', ok: false })
  const [ruleMsg, setRuleMsg] = useState({ text: '', ok: false })
  const [editMsg, setEditMsg] = useState({ text: '', ok: false })
  const [tplMsg, setTplMsg] = useState({ text: '', ok: false })

  const loadData = async () => {
    try {
      const d = await apiFetch('/api/alerts/stats')
      setStats(d || {})
      setRules(Array.isArray(d?.rules) ? d.rules : [])
    } catch (_) {}
    try {
      const l = await apiFetch('/api/alerts/log')
      setLogs(Array.isArray(l) ? l : [])
    } catch (_) {}
  }

  usePolling(loadData, 15000)

  useEffect(() => {
    async function loadConfigs() {
      try { setEmail(await apiFetch('/api/alerts/email_config')) } catch (_) {}
      try { setTelegram(await apiFetch('/api/alerts/telegram_config')) } catch (_) {}
      try { setDiscord(await apiFetch('/api/alerts/discord_config')) } catch (_) {}
      try { setTpl(await apiFetch('/api/alerts/template')) } catch (_) {}
    }
    loadConfigs()
  }, [])

  const saveEmail = async () => {
    try {
      const r = await apiPost('/api/alerts/email_config', email)
      setEmailMsg({ text: r.success ? 'Email config saved.' : (r.error || 'Failed'), ok: Boolean(r.success) })
    } catch (e: any) {
      setEmailMsg({ text: e.message, ok: false })
    }
  }

  const testEmail = async () => {
    const to = prompt('Send test email to:', email.from_addr || '')
    if (!to) return
    setEmailMsg({ text: 'Sending test email...', ok: true })
    try {
      const r = await apiPost('/api/alerts/test_email', { to_email: to })
      setEmailMsg({ text: r.success ? 'Test email delivered!' : `ERROR: ${r.error || 'failed'}`, ok: Boolean(r.success) })
    } catch (e: any) {
      setEmailMsg({ text: e.message, ok: false })
    }
  }

  const saveTelegram = async () => {
    try {
      const r = await apiPost('/api/alerts/telegram_config', telegram)
      setTgMsg({ text: r.success ? 'Telegram config saved.' : (r.error || 'Failed'), ok: Boolean(r.success) })
    } catch (e: any) {
      setTgMsg({ text: e.message, ok: false })
    }
  }

  const testTelegram = async () => {
    setTgMsg({ text: 'Sending test message...', ok: true })
    try {
      const r = await apiPost('/api/alerts/test_telegram', {})
      setTgMsg({ text: r.success ? (r.message || 'Telegram sent!') : `ERROR: ${r.error}`, ok: Boolean(r.success) })
    } catch (e: any) {
      setTgMsg({ text: e.message, ok: false })
    }
  }

  const saveDiscord = async () => {
    try {
      const r = await apiPost('/api/alerts/discord_config', discord)
      setDcMsg({ text: r.success ? 'Discord config saved.' : (r.error || 'Failed'), ok: Boolean(r.success) })
    } catch (e: any) {
      setDcMsg({ text: e.message, ok: false })
    }
  }

  const testDiscord = async () => {
    setDcMsg({ text: 'Sending test message...', ok: true })
    try {
      const r = await apiPost('/api/alerts/test_discord', {})
      setDcMsg({ text: r.success ? (r.message || 'Discord sent!') : `ERROR: ${r.error}`, ok: Boolean(r.success) })
    } catch (e: any) {
      setDcMsg({ text: e.message, ok: false })
    }
  }

  const addRule = async () => {
    if (!newRule.name.trim()) {
      setRuleMsg({ text: 'Rule name is required.', ok: false })
      return
    }
    try {
      const r = await apiPost('/api/alerts/rules/add', {
        name: newRule.name.trim(),
        source_type: newRule.source_type,
        host_match: newRule.host_match.trim(),
        exclude_hosts: newRule.exclude_hosts.trim(),
        text_match: newRule.text_match.trim(),
        to_email: newRule.to_email.trim(),
        notify_via: notifyVia.join(',')
      })
      if (r.success !== false) {
        setRuleMsg({ text: 'Alert rule added.', ok: true })
        setNewRule({ name: '', source_type: 'syslog', host_match: '', exclude_hosts: '', text_match: '', to_email: '' })
        loadData()
      } else {
        setRuleMsg({ text: r.error || 'Failed', ok: false })
      }
    } catch (e: any) {
      setRuleMsg({ text: e.message, ok: false })
    }
  }

  const toggleRule = async (r: any) => {
    try {
      await apiPost('/api/alerts/rules/toggle', { id: r.id })
      loadData()
    } catch (_) {}
  }

  const deleteRule = async (r: any) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return
    try {
      await apiPost('/api/alerts/rules/delete', { id: r.id })
      loadData()
    } catch (_) {}
  }

  const saveEdit = async () => {
    try {
      const r = await apiPost('/api/alerts/rules/edit', editRule)
      if (r.success !== false) {
        setEditRule(null)
        loadData()
      } else {
        setEditMsg({ text: r.error || 'Failed', ok: false })
      }
    } catch (e: any) {
      setEditMsg({ text: e.message, ok: false })
    }
  }

  const saveTemplate = async () => {
    try {
      const r = await apiPost('/api/alerts/template', { subject: tpl.subject, body: tpl.body })
      setTplMsg({ text: r.success !== false ? 'Template saved.' : 'Failed', ok: r.success !== false })
    } catch (e: any) {
      setTplMsg({ text: e.message, ok: false })
    }
  }

  const resetTemplate = async () => {
    if (!confirm('Reset template to system defaults?')) return
    try {
      await apiPost('/api/alerts/template', {
        subject: 'Smart NOC Alert [{host}]',
        body: 'Host: {host}\nTime: {time}\n\n{message}'
      })
      const t = await apiFetch('/api/alerts/template')
      setTpl(t)
      setTplMsg({ text: 'Template reset to default.', ok: true })
    } catch (e: any) {
      setTplMsg({ text: e.message, ok: false })
    }
  }

  const activeRules = rules.filter(r => r.enabled).length

  return (
    <div className="space-y-6">
      {/* ── 4 KPI CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Rules Active</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{activeRules}</div>
          <div className="text-[10px] text-slate-500">monitoring streams</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Alerts Sent</div>
          <div className="text-2xl font-bold font-mono text-cyan-400">{stats.total_sent ?? 0}</div>
          <div className="text-[10px] text-slate-500">all time dispatched</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Send Failures</div>
          <div className="text-2xl font-bold font-mono text-rose-400">{stats.total_failed ?? 0}</div>
          <div className="text-[10px] text-slate-500">delivery errors</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Total Rules</div>
          <div className="text-2xl font-bold font-mono text-amber-400">{rules.length}</div>
          <div className="text-[10px] text-slate-500">configured</div>
        </div>
      </div>

      {/* ── CHANNEL DELIVERY CONFIGURATION ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Email */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              SMTP Email Notification
            </h3>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              email.enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {email.enabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={email.smtp_host || ''}
                  onChange={e => setEmail({ ...email, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={email.smtp_port ?? 587}
                  onChange={e => setEmail({ ...email, smtp_port: parseInt(e.target.value) || 587 })}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Username</label>
                <input
                  type="text"
                  value={email.smtp_user || ''}
                  onChange={e => setEmail({ ...email, smtp_user: e.target.value })}
                  placeholder="your@domain.com"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  value={email.smtp_pass || ''}
                  onChange={e => setEmail({ ...email, smtp_pass: e.target.value })}
                  placeholder="app password"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">From Address</label>
              <input
                type="text"
                value={email.from_addr || ''}
                onChange={e => setEmail({ ...email, from_addr: e.target.value })}
                placeholder="noc@yourdomain.com"
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={email.use_tls !== false}
                  onChange={e => setEmail({ ...email, use_tls: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500"
                />
                <span>USE TLS</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(email.enabled)}
                  onChange={e => setEmail({ ...email, enabled: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500"
                />
                <span>EMAIL ALERTS ENABLED</span>
              </label>
            </div>

            <StatusMessage msg={emailMsg.text} ok={emailMsg.ok} />

            {isAdmin && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveEmail}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase"
                >
                  Save Email
                </button>
                <button
                  onClick={testEmail}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Send Test
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Telegram & Discord */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          {/* Telegram */}
          <div className="space-y-3 pb-4 border-b border-slate-800">
            <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-cyan-400" />
              Telegram Bot Channel
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Bot Token</label>
                <input
                  type="text"
                  value={telegram.bot_token || ''}
                  onChange={e => setTelegram({ ...telegram, bot_token: e.target.value })}
                  placeholder="123456:ABC-DEF..."
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Chat ID</label>
                <input
                  type="text"
                  value={telegram.chat_id || ''}
                  onChange={e => setTelegram({ ...telegram, chat_id: e.target.value })}
                  placeholder="-1001234567890"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(telegram.enabled)}
                onChange={e => setTelegram({ ...telegram, enabled: e.target.checked })}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>TELEGRAM NOTIFICATIONS ENABLED</span>
            </label>
            <StatusMessage msg={tgMsg.text} ok={tgMsg.ok} />
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={saveTelegram} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase">
                  Save Telegram
                </button>
                <button onClick={testTelegram} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                  Test Telegram
                </button>
              </div>
            )}
          </div>

          {/* Discord */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              Discord Webhook
            </h3>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Webhook URL</label>
              <input
                type="text"
                value={discord.webhook_url || ''}
                onChange={e => setDiscord({ ...discord, webhook_url: e.target.value })}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(discord.enabled)}
                onChange={e => setDiscord({ ...discord, enabled: e.target.checked })}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>DISCORD NOTIFICATIONS ENABLED</span>
            </label>
            <StatusMessage msg={dcMsg.text} ok={dcMsg.ok} />
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={saveDiscord} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase">
                  Save Discord
                </button>
                <button onClick={testDiscord} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                  Test Discord
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ADD RULE FORM ────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-400" />
            Add Alert Rule
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="e.g. BSNL Uplink Down"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Source Stream</label>
                <select
                  value={newRule.source_type}
                  onChange={e => setNewRule({ ...newRule, source_type: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="syslog">Syslog Stream</option>
                  <option value="ping">Ping Monitor Offline</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Host Match (empty = all)</label>
                <input
                  type="text"
                  value={newRule.host_match}
                  onChange={e => setNewRule({ ...newRule, host_match: e.target.value })}
                  placeholder="e.g. BSNL_TMG"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Send Email To</label>
                <input
                  type="text"
                  value={newRule.to_email}
                  onChange={e => setNewRule({ ...newRule, to_email: e.target.value })}
                  placeholder="admin@yourdomain.com"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {newRule.source_type === 'syslog' && (
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Text Match Pattern (one per line = AND logic)
                </label>
                <textarea
                  value={newRule.text_match}
                  onChange={e => setNewRule({ ...newRule, text_match: e.target.value })}
                  rows={2}
                  placeholder="Uplink-port&#10;Down"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            <div className="flex gap-4 pt-1">
              <span className="text-xs font-mono text-slate-400 self-center">Notify via:</span>
              {['email', 'telegram', 'discord'].map(ch => (
                <label key={ch} className="flex items-center gap-1.5 text-xs font-mono text-slate-300 capitalize cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyVia.includes(ch)}
                    onChange={() =>
                      setNotifyVia(prev =>
                        prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
                      )
                    }
                    className="rounded border-slate-700 text-cyan-500"
                  />
                  <span>{ch}</span>
                </label>
              ))}
            </div>

            <StatusMessage msg={ruleMsg.text} ok={ruleMsg.ok} />

            <button
              onClick={addRule}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all"
            >
              + Create Alert Rule
            </button>
          </div>
        </div>
      )}

      {/* ── RULES TABLE ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Configured Alert Rules</h3>
            <p className="text-xs font-mono text-slate-400">Automated triggers and dispatches</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{rules.length} rules</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Rule Name</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Host Match</th>
                <th className="py-3 px-4">Text Pattern</th>
                <th className="py-3 px-4">Send To</th>
                <th className="py-3 px-4">Hits</th>
                <th className="py-3 px-4">Status</th>
                {isAdmin && <th className="py-3 px-4 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!rules.length ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">No alert rules configured.</td>
                </tr>
              ) : (
                rules.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 text-slate-100 font-bold font-sans">{r.name}</td>
                    <td className="py-2.5 px-4 text-cyan-400 uppercase">{r.source_type}</td>
                    <td className="py-2.5 px-4 text-slate-300">{r.host_match || 'All'}</td>
                    <td className="py-2.5 px-4 text-slate-400 truncate max-w-xs">{r.text_match || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-300">{r.to_email || '-'}</td>
                    <td className="py-2.5 px-4 text-amber-400 font-bold">{r.hit_count ?? 0}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        r.enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {r.enabled ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => toggleRule(r)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700"
                          >
                            {r.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            onClick={() => setEditRule({ ...r })}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] border border-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteRule(r)}
                            className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] border border-rose-500/30"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ALERT LOGS TABLE ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Dispatched Alerts Feed</h3>
            <p className="text-xs font-mono text-slate-400">Audit trail of triggered notification dispatches</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{logs.length} events</span>
        </div>

        <div className="overflow-x-auto max-h-[360px]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Triggered Rule</th>
                <th className="py-3 px-4">Host</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Message Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!logs.length ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">No alerts triggered yet.</td>
                </tr>
              ) : (
                logs.slice(0, 100).map(l => (
                  <tr key={l.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-slate-300">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="py-2.5 px-4 font-bold text-cyan-400 font-sans">{l.rule_name || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-300">{l.host || '-'}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        l.sent ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {l.sent ? 'SENT' : 'FAILED'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 truncate max-w-md" title={l.message}>{l.message || l.error || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── EMAIL TEMPLATE EDITOR ────────────────────────────────────── */}
      {isAdmin && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div
            onClick={() => setTplOpen(!tplOpen)}
            className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors"
          >
            <div>
              <h3 className="text-sm font-bold tracking-wide text-slate-100">Email Notification Template</h3>
              <p className="text-xs font-mono text-slate-400">Custom dynamic placeholders: {`{host}, {message}, {time}`}</p>
            </div>
            <button className="p-1 rounded-lg text-slate-400">
              {tplOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {tplOpen && (
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={tpl.subject || ''}
                  onChange={e => setTpl({ ...tpl, subject: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Body</label>
                <textarea
                  value={tpl.body || ''}
                  onChange={e => setTpl({ ...tpl, body: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <StatusMessage msg={tplMsg.text} ok={tplMsg.ok} />
              <div className="flex gap-2 pt-1">
                <button onClick={saveTemplate} className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase">
                  Save Template
                </button>
                <button onClick={resetTemplate} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                  Reset Default
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Rule Modal */}
      {editRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100">Edit Alert Rule</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={editRule.name || ''}
                  onChange={e => setEditRule({ ...editRule, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Host Match</label>
                <input
                  type="text"
                  value={editRule.host_match || ''}
                  onChange={e => setEditRule({ ...editRule, host_match: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Text Contains</label>
                <textarea
                  value={editRule.text_match || ''}
                  onChange={e => setEditRule({ ...editRule, text_match: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Send To Email</label>
                <input
                  type="text"
                  value={editRule.to_email || ''}
                  onChange={e => setEditRule({ ...editRule, to_email: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <StatusMessage msg={editMsg.text} ok={editMsg.ok} />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditRule(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
