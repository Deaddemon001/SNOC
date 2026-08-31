import React, { useState } from 'react'
import { Zap, Plus, ExternalLink, Edit2, Trash2, Activity, AlertTriangle } from 'lucide-react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip
} from 'chart.js'
import { apiFetch, apiPost } from '../api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { usePolling } from '../hooks/usePolling'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

export const PingMonitorView: React.FC = () => {
  const { isAdmin } = useAuth()
  const { theme } = useTheme()

  const [targets, setTargets] = useState<any[]>([])
  const [newIp, setNewIp] = useState('')
  const [newName, setNewName] = useState('')
  const [newWebsite, setNewWebsite] = useState('')
  const [selectedIp, setSelectedIp] = useState('')
  const [histLabel, setHistLabel] = useState('Click any host row to view history')
  const [histRows, setHistRows] = useState<any[]>([])

  const loadData = async () => {
    try {
      const t = await apiFetch('/api/ping/targets')
      setTargets(Array.isArray(t) ? t : [])
    } catch (_) {}
  }

  usePolling(loadData, 10000)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIp.trim()) {
      alert('Please enter an IP address.')
      return
    }
    try {
      await apiPost('/api/ping/add', {
        ip: newIp.trim(),
        name: newName.trim(),
        website: newWebsite.trim()
      })
      setNewIp('')
      setNewName('')
      setNewWebsite('')
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleRemove = async (t: any) => {
    if (!confirm(`Remove ${t.name || t.ip} from monitoring?`)) return
    try {
      await apiPost('/api/ping/remove', { ip: t.ip })
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleRename = async (t: any) => {
    const nextName = prompt(`New label for ${t.ip}:`, t.name && t.name !== t.ip ? t.name : '')
    if (nextName === null) return
    const nextWeb = prompt(`Website URL for ${t.ip} (blank to clear):`, t.website || '')
    if (nextWeb === null) return
    try {
      await apiPost('/api/ping/rename', { ip: t.ip, name: nextName.trim(), website: nextWeb.trim() })
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const showHistory = async (t: any) => {
    setSelectedIp(t.ip)
    setHistLabel(`${t.name || t.ip} (${t.ip})`)
    try {
      const rows = await apiFetch(`/api/ping/history/${encodeURIComponent(t.ip)}`)
      setHistRows(Array.isArray(rows) ? [...rows].reverse() : [])
    } catch (_) {
      setHistRows([])
    }
  }

  const online = targets.filter(t => t.status === 'online').length
  const offline = targets.filter(t => t.status === 'offline').length
  const highLat = targets.filter(t => t.latency_ms && t.latency_ms > 100).length

  const sortedTargets = [...targets].sort((a, b) => {
    if (a.status === 'offline' && b.status !== 'offline') return -1
    if (b.status === 'offline' && a.status !== 'offline') return 1
    return (a.name || a.ip).localeCompare(b.name || b.ip)
  })

  const latColor = (ms: any) => {
    if (!ms) return 'text-slate-500'
    const n = parseFloat(ms)
    if (n < 50) return 'text-emerald-400'
    if (n < 100) return 'text-amber-400'
    return 'text-rose-400'
  }

  const latBg = (ms: any) => {
    if (!ms) return 'bg-slate-700'
    const n = parseFloat(ms)
    if (n < 50) return 'bg-emerald-400'
    if (n < 100) return 'bg-amber-400'
    return 'bg-rose-400'
  }

  const lossColor = (l: any) => {
    const n = parseFloat(l) || 0
    if (n > 20) return 'text-rose-400'
    if (n > 5) return 'text-amber-400'
    return 'text-emerald-400'
  }

  const latBarPct = (t: any) => {
    const maxLat = Math.max(200, (t.avg_latency || t.latency_ms || 50) * 3)
    return Math.min(100, ((t.latency_ms || 0) / maxLat) * 100)
  }

  const normalizeUrl = (u: string) => {
    const v = (u || '').trim()
    if (!v) return ''
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`
  }

  const isDark = theme === 'dark'
  const tickColor = isDark ? '#64748b' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'

  const histData = {
    labels: histRows.map(r => new Date(r.timestamp).toLocaleTimeString()),
    datasets: [
      {
        data: histRows.map(r => r.latency_ms),
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      }
    ]
  }

  const histOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
    }
  }

  return (
    <div className="space-y-6">
      {/* ── 4 KPI CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Online Hosts</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{online}</div>
          <div className="text-[10px] text-slate-500">reachable</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Offline Hosts</div>
          <div className="text-2xl font-bold font-mono text-rose-400">{offline}</div>
          <div className="text-[10px] text-slate-500">packet loss 100%</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">High Latency</div>
          <div className="text-2xl font-bold font-mono text-amber-400">{highLat}</div>
          <div className="text-[10px] text-slate-500">&gt; 100ms response</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Total Monitored</div>
          <div className="text-2xl font-bold font-mono text-cyan-400">{targets.length}</div>
          <div className="text-[10px] text-slate-500">ICMP targets</div>
        </div>
      </div>

      {/* ── ADD TARGET PANEL ─────────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-400" />
          Add ICMP Ping Target
        </h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">IP Address</label>
            <input
              type="text"
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              placeholder="e.g. 192.168.1.1"
              disabled={!isAdmin}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Label (Optional)</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Core Router"
              disabled={!isAdmin}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Website URL</label>
            <input
              type="text"
              value={newWebsite}
              onChange={e => setNewWebsite(e.target.value)}
              placeholder="e.g. https://router.local"
              disabled={!isAdmin}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!isAdmin}
            className="w-full py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all disabled:opacity-40"
          >
            {isAdmin ? '+ Add Target' : 'View Only'}
          </button>
        </form>
      </div>

      {/* ── MONITORED TARGETS TABLE ──────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Live Ping Targets</h3>
            <p className="text-xs font-mono text-slate-400">Click any row to display latency trend history below</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{targets.length} targets</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Pings</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Label</th>
                <th className="py-3 px-4 text-right">Avg</th>
                <th className="py-3 px-4 text-right">Min</th>
                <th className="py-3 px-4 text-right">Cur</th>
                <th className="py-3 px-4 text-right">PL%</th>
                <th className="py-3 px-4">Latency Bar</th>
                <th className="py-3 px-4">Last Seen</th>
                <th className="py-3 px-4 text-center">Launch</th>
                {isAdmin && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!sortedTargets.length ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500">No targets configured. Add an IP above.</td>
                </tr>
              ) : (
                sortedTargets.map(t => {
                  const isSel = selectedIp === t.ip
                  const isOnline = t.status === 'online'
                  return (
                    <tr
                      key={t.ip}
                      onClick={() => showHistory(t)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                        isSel ? 'bg-cyan-500/10' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1.5 ${
                          isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center text-slate-500">{t.ping_count || '—'}</td>
                      <td className="py-2.5 px-4 text-cyan-400 font-bold">{t.ip}</td>
                      <td className="py-2.5 px-4 text-slate-200 font-sans font-medium">{t.name || t.ip}</td>
                      <td className={`py-2.5 px-4 text-right font-bold ${latColor(t.avg_latency)}`}>
                        {t.avg_latency ? `${parseFloat(t.avg_latency).toFixed(1)} ms` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-400">
                        {t.min_latency ? `${parseFloat(t.min_latency).toFixed(1)} ms` : '—'}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-bold ${latColor(t.latency_ms)}`}>
                        {t.latency_ms ? `${parseFloat(t.latency_ms).toFixed(1)} ms` : '—'}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-bold ${lossColor(t.loss_pct)}`}>
                        {t.loss_pct ? `${parseFloat(t.loss_pct).toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${latBg(t.latency_ms)}`} style={{ width: `${latBarPct(t)}%` }} />
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                        {t.last_seen ? new Date(t.last_seen).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {t.website ? (
                          <a
                            href={normalizeUrl(t.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 text-[10px] inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Launch
                          </a>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleRename(t)}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleRemove(t)}
                              className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] border border-rose-500/30"
                            >
                              Del
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── LATENCY HISTORY CHART ────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[260px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Latency History: {histLabel}
          </h3>
          <span className="text-[10px] font-mono text-slate-500">{histRows.length} points</span>
        </div>
        <div className="flex-1 min-h-[200px]">
          {histRows.length ? (
            <Line data={histData} options={histOpts} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
              Click a target host in the table above to visualize latency trend.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
