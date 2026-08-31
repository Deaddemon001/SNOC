import React, { useState, useEffect } from 'react'
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'
import { apiFetch, apiPost } from '../api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { usePolling } from '../hooks/usePolling'
import { StatusMessage } from '../components/shared/StatusMessage'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

export const SyslogView: React.FC = () => {
  const { isAdmin } = useAuth()
  const { theme } = useTheme()

  const [devices, setDevices] = useState<any[]>([])
  const [summary, setSummary] = useState<any[]>([])
  const [severity, setSeverity] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [allSyslog, setAllSyslog] = useState<any[]>([])

  const [oltFilter, setOltFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 50
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [renameNames, setRenameNames] = useState<Record<string, string>>({})
  const [statusMsg, setStatusMsg] = useState({ text: '', ok: true })

  const flash = (text: string, ok = true) => {
    setStatusMsg({ text, ok })
    setTimeout(() => setStatusMsg({ text: '', ok: true }), 3500)
  }

  const loadAll = async () => {
    const q = oltFilter ? `?olt_hostname=${encodeURIComponent(oltFilter)}` : ''
    try {
      const [devs, summ, sev] = await Promise.all([
        apiFetch('/api/syslog/devices').catch(() => []),
        apiFetch('/api/syslog/summary').catch(() => []),
        apiFetch('/api/syslog/severity').catch(() => [])
      ])
      setDevices(Array.isArray(devs) ? devs : [])
      setSummary(Array.isArray(summ) ? summ : [])
      setSeverity(Array.isArray(sev) ? sev : [])
    } catch (_) {}

    try {
      const evts = await apiFetch(`/api/syslog/events${q}${q ? '&' : '?'}limit=${limit}&offset=${offset}`)
      setEvents(Array.isArray(evts) ? evts : [])
    } catch (_) {}

    try {
      const sys = await apiFetch(`/api/syslog${q}`)
      setAllSyslog(Array.isArray(sys) ? sys : [])
    } catch (_) {}
  }

  usePolling(loadAll, 10000)

  // Real-time device status calculation
  const getDeviceStatus = (lastSeen: string | null) => {
    if (!lastSeen) return { cls: 'border-slate-700 bg-slate-900/50 text-slate-500', pill: 'bg-slate-800 text-slate-400 border-slate-700', label: 'Unknown' }
    const diffSec = (Date.now() - new Date(lastSeen).getTime()) / 1000
    if (diffSec < 60) return { cls: 'border-emerald-500/40 bg-emerald-950/10 text-emerald-400', pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Receiving' }
    if (diffSec < 300) return { cls: 'border-amber-500/40 bg-amber-950/10 text-amber-400', pill: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Standby' }
    return { cls: 'border-rose-500/40 bg-rose-950/10 text-rose-400', pill: 'bg-rose-500/10 text-rose-400 border-rose-500/30', label: 'Offline' }
  }

  const authorizedDevices = devices.filter(d => d.authorized === 1)

  // Device actions
  const handleRename = async (hostname: string) => {
    const name = (renameNames[hostname] ?? '').trim()
    if (!name) return
    try {
      await apiPost('/api/syslog/devices/rename', { olt_hostname: hostname, name })
      flash('Device renamed successfully.')
      loadAll()
    } catch (e: any) {
      flash('Rename failed: ' + (e.backendError || e.message), false)
    }
  }

  const handleSetAuth = async (hostname: string, authStatus: number) => {
    const action = authStatus === 1 ? 'accept' : 'deny'
    if (!confirm(`Are you sure you want to ${action} syslog device "${hostname}"?`)) return
    try {
      const r = await apiPost('/api/syslog/devices/authorize', { olt_hostname: hostname, authorized: authStatus })
      if (r.success) {
        flash(`Device ${action}ed.`)
        loadAll()
      } else {
        flash('Error: ' + (r.error || 'Failed'), false)
      }
    } catch (e: any) {
      flash('Request failed: ' + (e.backendError || e.message), false)
    }
  }

  const handleDeleteDevice = async (hostname: string) => {
    if (!confirm(`Delete syslog device "${hostname}" and ALL stored logs? This cannot be undone.`)) return
    try {
      const r = await apiPost('/api/syslog/devices/delete', { olt_hostname: hostname })
      if (r.success) {
        if (oltFilter === hostname) setOltFilter('')
        flash('Device and logs deleted.')
        loadAll()
      } else {
        flash('Error: ' + (r.error || 'Failed'), false)
      }
    } catch (e: any) {
      flash('Request failed: ' + (e.backendError || e.message), false)
    }
  }

  // Helpers
  const authTags = ['USER_LOGIN', 'USER_LOGOUT', 'LOGIN_FAILED']
  const linkTags = ['UPLINK_UP', 'UPLINK_DOWN']
  const authCount = events.filter(e => authTags.includes(e.event_tag)).length
  const linkCount = events.filter(e => linkTags.includes(e.event_tag)).length
  const lastEvent = events[0]

  const isDark = theme === 'dark'
  const tickColor = isDark ? '#64748b' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'

  // Event Chart
  const eventChartData = {
    labels: summary.slice(0, 8).map(s => s.event_tag || 'GENERAL'),
    datasets: [
      {
        data: summary.slice(0, 8).map(s => s.count),
        backgroundColor: '#00e5ff',
        borderRadius: 4
      }
    ]
  }

  const eventOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9, family: 'Share Tech Mono' } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
    }
  }

  // Severity Chart
  const SEV_COLORS = ['#f43f5e', '#f97316', '#f59e0b', '#00e5ff', '#10b981', '#64748b']
  const sevChartData = {
    labels: severity.map(s => s.severity),
    datasets: [
      {
        data: severity.map(s => s.count),
        backgroundColor: SEV_COLORS,
        borderWidth: 0
      }
    ]
  }

  const sevOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { position: 'right' as const, labels: { color: tickColor, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 } } }
  }

  const parseDetails = (msg: string) => {
    let m = msg.match(/Uplink-port\s+([\d\/]+)\s+(Up|Down)/i)
    if (m) return { details: `Uplink-port ${m[1]} is ${m[2].toUpperCase()}`, who: `Port ${m[1]}` }
    m = msg.match(/User\s+(\S+)\s+logged\s+(in|out)\s+from\s+([\d.]+)(?:\s+on\s+(\S+))?/i)
    if (m) {
      const via = m[4] ? m[4].toUpperCase().replace(/\./g, '') : ''
      let details = m[2].toLowerCase() === 'in' ? 'Logged IN' : 'Logged OUT'
      if (via) details += ' via ' + via
      return { details, who: `${m[1]} from ${m[3]}` }
    }
    m = msg.match(/User\s+(\S+)\s+login\s+failed\s+from\s+([\d.]+)/i)
    if (m) return { details: 'Login FAILED', who: `${m[1]} from ${m[2]}` }
    return { details: msg.substring(0, 60), who: '' }
  }

  return (
    <div className="space-y-6">
      {/* ── TOP DEVICE GRID PANEL ────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Syslog OLT Devices
            </h2>
            <p className="text-xs font-mono text-slate-400">Live Device Monitoring &amp; Access Authorization</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={oltFilter}
                onChange={e => {
                  setOltFilter(e.target.value)
                  loadAll()
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-950 border border-slate-800 text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Authorized OLTs</option>
                {authorizedDevices.map(d => (
                  <option key={d.olt_hostname} value={d.olt_hostname}>
                    {d.name && d.name !== d.olt_hostname ? d.name : d.olt_hostname}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg">
              {devices.length} devices
            </span>
          </div>
        </div>

        {/* Device Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {!devices.length ? (
            <div className="col-span-full py-8 text-center text-xs font-mono text-slate-500">
              No syslog devices discovered yet. Ingest UDP port 5141 messages to register.
            </div>
          ) : (
            devices.map(dv => {
              const st = getDeviceStatus(dv.last_seen)
              const isAccepted = dv.authorized === 1
              const isDenied = dv.authorized === 2
              const curName = renameNames[dv.olt_hostname] ?? (dv.name && dv.name !== dv.olt_hostname ? dv.name : '')

              return (
                <div
                  key={dv.olt_hostname}
                  className={`p-4 rounded-xl border bg-slate-950/40 hover:bg-slate-900/60 transition-all flex flex-col justify-between space-y-3 ${st.cls}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-100 truncate">
                          {dv.name && dv.name !== dv.olt_hostname ? dv.name : dv.olt_hostname}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                            {dv.olt_hostname}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                              isAccepted
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : isDenied
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {isAccepted ? 'Accepted' : isDenied ? 'Denied' : 'Pending'}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${st.pill}`}>
                        {st.label}
                      </span>
                    </div>

                    <div className="text-xs font-mono space-y-1 text-slate-400 pt-1">
                      <div>IP: <span className="text-slate-200">{dv.source_ip || '—'}</span></div>
                      <div>Last seen: <span className="text-slate-200">{dv.last_seen ? new Date(dv.last_seen).toLocaleTimeString() : 'Never'}</span></div>
                    </div>
                  </div>

                  {/* Rename input */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={curName}
                        onChange={e => setRenameNames({ ...renameNames, [dv.olt_hostname]: e.target.value })}
                        placeholder="Device name..."
                        className="flex-1 px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={() => handleRename(dv.olt_hostname)}
                        className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700"
                      >
                        Save
                      </button>
                    </div>

                    {/* Admin Actions */}
                    {isAdmin && (
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5">
                          {dv.authorized !== 1 && (
                            <button
                              onClick={() => handleSetAuth(dv.olt_hostname, 1)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                            >
                              Accept
                            </button>
                          )}
                          {dv.authorized !== 2 && (
                            <button
                              onClick={() => handleSetAuth(dv.olt_hostname, 2)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                            >
                              Deny
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteDevice(dv.olt_hostname)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <StatusMessage msg={statusMsg.text} ok={statusMsg.ok} />

      {/* ── 4 KPI STAT CARDS ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Total Logs</div>
          <div className="text-xl font-bold font-mono text-cyan-400">{allSyslog.length}</div>
          <div className="text-[10px] text-slate-500">all time stored</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Login Events</div>
          <div className="text-xl font-bold font-mono text-emerald-400">{authCount}</div>
          <div className="text-[10px] text-slate-500">user logins/outs</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Uplink Events</div>
          <div className="text-xl font-bold font-mono text-orange-400">{linkCount}</div>
          <div className="text-[10px] text-slate-500">port state changes</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Last Event</div>
          <div className="text-sm font-bold font-mono text-amber-400 truncate">
            {lastEvent ? new Date(lastEvent.timestamp).toLocaleTimeString() : '—'}
          </div>
          <div className="text-[10px] text-slate-500 truncate">{lastEvent?.event_tag || 'GENERAL'}</div>
        </div>
      </div>

      {/* ── 2 CHARTS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Events by Type</h3>
            <span className="text-[10px] font-mono text-slate-500">{summary.length} types</span>
          </div>
          <div className="flex-1 min-h-[200px]">
            <Bar data={eventChartData} options={eventOpts} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Severity Distribution</h3>
            <span className="text-[10px] font-mono text-slate-500">{severity.length} levels</span>
          </div>
          <div className="flex-1 min-h-[200px]">
            <Doughnut data={sevChartData} options={sevOpts} />
          </div>
        </div>
      </div>

      {/* ── PAGINATED OLT EVENTS TABLE ───────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">OLT Uplink &amp; Login Events</h3>
            <p className="text-xs font-mono text-slate-400">Structured event extraction with details</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Page {Math.floor(offset / limit) + 1}</span>
            <button
              onClick={() => setOffset(prev => Math.max(0, prev - limit))}
              disabled={offset === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setOffset(prev => prev + limit)}
              disabled={events.length < limit}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 px-4">Date / Time</th>
                <th className="py-3 px-4">Age</th>
                <th className="py-3 px-4">OLT</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4">User / Port</th>
                <th className="py-3 px-4 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!events.length ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">No events on this page.</td>
                </tr>
              ) : (
                events.map(e => {
                  const p = parseDetails(e.message || '')
                  const isExpanded = expandedId === e.id
                  return (
                    <React.Fragment key={e.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : e.id)}
                        className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 text-slate-300">
                          {new Date(e.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                        </td>
                        <td className="py-3 px-4 text-amber-400 text-[11px]">
                          {Math.floor((Date.now() - new Date(e.timestamp).getTime()) / 60000)}m ago
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                            {e.olt_hostname || e.source_ip || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-200">{e.event_tag || '-'}</td>
                        <td className="py-3 px-4 text-slate-300">{p.details}</td>
                        <td className="py-3 px-4 text-orange-400">{p.who}</td>
                        <td className="py-3 px-4 text-center text-slate-500">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-cyan-500/5">
                          <td colSpan={7} className="py-3 px-6 text-xs font-mono text-cyan-300">
                            {e.message}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ALL SYSLOG STREAM TABLE ──────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">All Syslog Messages</h3>
            <p className="text-xs font-mono text-slate-400">Raw syslog buffer (latest 200 records)</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{allSyslog.length} records</span>
        </div>

        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">OLT</th>
                <th className="py-3 px-4">Source IP</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">PON</th>
                <th className="py-3 px-4">ONU SN</th>
                <th className="py-3 px-4">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!allSyslog.length ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">No syslog received yet.</td>
                </tr>
              ) : (
                allSyslog.slice(0, 200).map((s, i) => (
                  <tr key={s.id || i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500">{i + 1}</td>
                    <td className="py-2.5 px-4 text-slate-300">{new Date(s.timestamp).toLocaleTimeString()}</td>
                    <td className="py-2.5 px-4 text-cyan-400 font-bold">{s.olt_hostname || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-400">{s.source_ip || '-'}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase">
                        {s.severity || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{s.onu_pon || '-'}</td>
                    <td className="py-2.5 px-4 text-orange-400">{s.onu_sn || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-md truncate" title={s.message}>{s.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
