import React, { useState, useEffect } from 'react'
import { Settings, X, Save, RotateCw, Power, ExternalLink, ShieldCheck, Database, Sliders, Clock } from 'lucide-react'
import { apiFetch, apiPost } from '../../api'
import { useAuth, SETTINGS_TAB_OPTIONS } from '../../context/AuthContext'
import { StatusMessage } from '../shared/StatusMessage'

interface SettingsModalProps {
  onClose: () => void
  onOpenRestart: (target: string) => void
  onOpenShutdown: () => void
}

const RETENTION_KEYS = [
  { id: 'trap_retention_days', label: 'SNMP traps' },
  { id: 'syslog_retention_days', label: 'Syslog events' },
  { id: 'ping_retention_days', label: 'Ping history' },
  { id: 'tftp_retention_days', label: 'TFTP backups' },
  { id: 'alert_log_retention_days', label: 'Alert log' },
  { id: 'olt_data_retention_days', label: 'OLT data' },
  { id: 'olt_session_retention_days', label: 'OLT sessions' }
]

const PORT_KEYS = [
  { id: 'api_port', label: 'API (HTTP)' },
  { id: 'https_port', label: 'API (HTTPS)' },
  { id: 'snmp_port', label: 'SNMP trap (UDP)' },
  { id: 'syslog_port', label: 'Syslog (UDP)' },
  { id: 'tftp_port', label: 'TFTP (UDP)' }
]

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onOpenRestart, onOpenShutdown }) => {
  const { isAdmin, applyGlobalTabs } = useAuth()

  const [retention, setRetention] = useState<Record<string, number>>({})
  const [ports, setPorts] = useState<Record<string, number>>({})
  const [selectedTabs, setSelectedTabs] = useState<string[]>([])
  const [sessionTimeout, setSessionTimeout] = useState<number>(30)

  const [retMsg, setRetMsg] = useState({ text: '', ok: false })
  const [portMsg, setPortMsg] = useState({ text: '', ok: false })
  const [tabsMsg, setTabsMsg] = useState({ text: '', ok: false })
  const [timeoutMsg, setTimeoutMsg] = useState({ text: '', ok: false })

  useEffect(() => {
    async function loadData() {
      try {
        const r = await apiFetch('/api/settings/retention')
        if (r) setRetention(r)
      } catch (_) {}
      try {
        const p = await apiFetch('/api/settings/ports')
        if (p) setPorts(p)
      } catch (_) {}
      try {
        const u = await apiFetch('/api/settings/ui')
        if (u && Array.isArray(u.visible_tabs)) setSelectedTabs(u.visible_tabs)
      } catch (_) {}
      try {
        const s = await apiFetch('/api/settings/security')
        if (s && s.session_timeout_minutes) setSessionTimeout(s.session_timeout_minutes)
      } catch (_) {}
    }
    loadData()
  }, [])

  const saveRetention = async () => {
    try {
      const res = await apiPost('/api/settings/retention', retention)
      setRetMsg({ text: res.success ? 'Retention settings saved.' : (res.error || 'Failed'), ok: Boolean(res.success) })
    } catch (e: any) {
      setRetMsg({ text: e.message || 'Request failed', ok: false })
    }
  }

  const savePorts = async () => {
    try {
      const res = await apiPost('/api/settings/ports', ports)
      setPortMsg({ text: res.message || (res.success ? 'Ports updated. App restart required.' : 'Failed'), ok: Boolean(res.success) })
    } catch (e: any) {
      setPortMsg({ text: e.message || 'Request failed', ok: false })
    }
  }

  const saveTabs = async () => {
    try {
      const res = await apiPost('/api/settings/ui', { visible_tabs: selectedTabs })
      if (res.success !== false) {
        applyGlobalTabs(selectedTabs)
        setTabsMsg({ text: 'Global tab visibility updated.', ok: true })
      } else {
        setTabsMsg({ text: res.error || 'Failed', ok: false })
      }
    } catch (e: any) {
      setTabsMsg({ text: e.message || 'Request failed', ok: false })
    }
  }

  const saveTimeout = async () => {
    try {
      const res = await apiPost('/api/settings/security', { session_timeout_minutes: sessionTimeout })
      setTimeoutMsg({ text: res.success ? 'Session timeout updated.' : (res.error || 'Failed'), ok: Boolean(res.success) })
    } catch (e: any) {
      setTimeoutMsg({ text: e.message || 'Request failed', ok: false })
    }
  }

  const toggleTab = (id: string) => {
    setSelectedTabs(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  const switchToLegacy = () => {
    window.location.href = '/?legacy=1'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">System &amp; Application Settings</h2>
              <p className="text-xs font-mono text-slate-400">Configuration &amp; Lifecycle Management</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* Data Retention */}
          {isAdmin && (
            <section className="space-y-3 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <Database className="w-4 h-4" />
                <span>Data Retention (Days)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {RETENTION_KEYS.map(k => (
                  <div key={k.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
                    <span className="text-xs text-slate-300">{k.label}</span>
                    <input
                      type="number"
                      min={1}
                      value={retention[k.id] ?? ''}
                      onChange={e => setRetention({ ...retention, [k.id]: parseInt(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 text-right text-xs font-mono bg-slate-900 border border-slate-700 rounded text-cyan-300 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                ))}
              </div>
              <StatusMessage msg={retMsg.text} ok={retMsg.ok} />
              <button
                onClick={saveRetention}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> Save Retention
              </button>
            </section>
          )}

          {/* Service Ports */}
          {isAdmin && (
            <section className="space-y-3 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <Sliders className="w-4 h-4" />
                <span>Service Ports</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PORT_KEYS.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
                    <span className="text-xs text-slate-300">{p.label}</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={ports[p.id] ?? ''}
                      onChange={e => setPorts({ ...ports, [p.id]: parseInt(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 text-right text-xs font-mono bg-slate-900 border border-slate-700 rounded text-cyan-300 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                ))}
              </div>
              <StatusMessage msg={portMsg.text} ok={portMsg.ok} />
              <button
                onClick={savePorts}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> Save Ports
              </button>
            </section>
          )}

          {/* Tab Visibility */}
          {isAdmin && (
            <section className="space-y-3 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Visible Tabs (Global)</span>
              </div>
              <p className="text-xs text-slate-400">Unchecking a tab hides it globally for non-admin viewers.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {SETTINGS_TAB_OPTIONS.map(t => (
                  <label key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-slate-700 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedTabs.includes(t.id)}
                      onChange={() => toggleTab(t.id)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
              <StatusMessage msg={tabsMsg.text} ok={tabsMsg.ok} />
              <button
                onClick={saveTabs}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> Save Tab Visibility
              </button>
            </section>
          )}

          {/* Session Timeout */}
          <section className="space-y-3 pb-6 border-b border-slate-800">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>Session Inactivity Timeout</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
              <span className="text-xs text-slate-300">Auto-logout after inactivity</span>
              <select
                value={sessionTimeout}
                onChange={e => setSessionTimeout(parseInt(e.target.value))}
                className="px-3 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-cyan-300 focus:outline-none focus:border-cyan-400"
              >
                {[15, 30, 60, 120, 240, 480].map(m => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>
            <StatusMessage msg={timeoutMsg.text} ok={timeoutMsg.ok} />
            <button
              onClick={saveTimeout}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Timeout
            </button>
          </section>

          {/* Power Controls */}
          {isAdmin && (
            <section className="space-y-3 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                <Power className="w-4 h-4" />
                <span>Headless Power Controls</span>
              </div>
              <p className="text-xs text-slate-400">Manage 24/7 background process execution without console access.</p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onOpenRestart('all')}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-2"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Restart Smart NOC
                </button>
                <button
                  onClick={onOpenShutdown}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-all flex items-center gap-2"
                >
                  <Power className="w-3.5 h-3.5" /> Shutdown Smart NOC
                </button>
              </div>
            </section>
          )}

          {/* UI Version Toggle */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-wider">
              <ExternalLink className="w-4 h-4" />
              <span>UI Version Switcher</span>
            </div>
            <p className="text-xs text-slate-400">Switch to the classic single-file legacy dashboard interface (<code>/?legacy=1</code>).</p>
            <button
              onClick={switchToLegacy}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition-all flex items-center gap-2"
            >
              ⏮ Switch to Legacy Version
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
