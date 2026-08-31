import React, { useState } from 'react'
import { Radio, Activity, AlertTriangle, Clock } from 'lucide-react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip
} from 'chart.js'
import { apiFetch } from '../api'
import { useTheme } from '../context/ThemeContext'
import { usePolling } from '../hooks/usePolling'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip)

export const SnmpTrapsView: React.FC = () => {
  const { theme } = useTheme()

  const [traps, setTraps] = useState<any[]>([])
  const [summary, setSummary] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  const loadData = async () => {
    try {
      const [t, s, dv] = await Promise.all([
        apiFetch('/api/traps').catch(() => []),
        apiFetch('/api/traps/summary').catch(() => []),
        apiFetch('/api/devices').catch(() => [])
      ])
      setTraps(Array.isArray(t) ? t : [])
      setSummary(Array.isArray(s) ? s : [])
      setDevices(Array.isArray(dv) ? dv : [])

      const nm: Record<string, string> = {}
      if (Array.isArray(dv)) {
        dv.forEach((d: any) => {
          nm[d.olt_mac] = d.name && d.name !== d.olt_id ? d.name : d.olt_id
        })
      }
      setNameMap(nm)
    } catch (_) {}
  }

  usePolling(loadData, 10000)

  const totalTraps = summary.reduce((a, s) => a + (s.count || 0), 0)
  const onlineCount = devices.filter(d => d.status === 'online').length
  const offlineCount = devices.filter(d => d.status === 'offline').length
  const lastTrap = traps[0]

  const isDark = theme === 'dark'
  const tickColor = isDark ? '#64748b' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'

  // Bar Chart
  const barData = {
    labels: summary.map(s => nameMap[s.olt_mac] || s.olt_id || s.olt_mac),
    datasets: [{ data: summary.map(s => s.count), backgroundColor: '#00e5ff', borderRadius: 4 }]
  }
  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
    }
  }

  // Line Chart
  const grouped: Record<string, number> = {}
  traps.slice(0, 60).reverse().forEach(t => {
    const min = (t.timestamp || '').substring(11, 16)
    grouped[min] = (grouped[min] || 0) + 1
  })
  const lineData = {
    labels: Object.keys(grouped),
    datasets: [{
      data: Object.values(grouped),
      borderColor: '#f97316',
      backgroundColor: 'rgba(249, 115, 22, 0.08)',
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.35,
      fill: true
    }]
  }
  const lineOpts = {
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
          <div className="text-[10px] font-mono uppercase text-slate-500">Total Traps</div>
          <div className="text-2xl font-bold font-mono text-cyan-400">{totalTraps.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">all time ingested</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Online OLTs</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{onlineCount}</div>
          <div className="text-[10px] text-slate-500">active now</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Offline OLTs</div>
          <div className="text-2xl font-bold font-mono text-rose-400">{offlineCount}</div>
          <div className="text-[10px] text-slate-500">no trap 2+ min</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Last Trap Received</div>
          <div className="text-base font-bold font-mono text-amber-400 truncate">
            {lastTrap ? new Date(lastTrap.timestamp).toLocaleTimeString() : '—'}
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            {lastTrap ? (nameMap[lastTrap.olt_mac] || lastTrap.olt_id || lastTrap.source_ip) : '—'}
          </div>
        </div>
      </div>

      {/* ── 2 CHARTS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Traps Per OLT</h3>
            <span className="text-[10px] font-mono text-slate-500">{summary.length} OLTs</span>
          </div>
          <div className="flex-1 min-h-[200px]">
            <Bar data={barData} options={barOpts} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Trap Volume Over Time</h3>
            <span className="text-[10px] font-mono text-slate-500">{traps.length} records</span>
          </div>
          <div className="flex-1 min-h-[200px]">
            <Line data={lineData} options={lineOpts} />
          </div>
        </div>
      </div>

      {/* ── OLT DEVICE STATUS GRID ───────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              OLT Device Status
            </h3>
            <p className="text-xs font-mono text-slate-400">Active SNMP trap transmitters</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{devices.length} devices</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {!devices.length ? (
            <div className="col-span-full py-8 text-center text-xs font-mono text-slate-500">
              No OLT trap senders seen yet.
            </div>
          ) : (
            devices.map(dv => {
              const isOnline = dv.status === 'online'
              return (
                <div
                  key={dv.olt_mac}
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    isOnline ? 'bg-emerald-950/10 border-emerald-500/30' : 'bg-rose-950/10 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-100">{dv.name && dv.name !== dv.olt_id ? dv.name : dv.olt_id}</div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                        {dv.olt_id || 'UNKNOWN'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {dv.status || 'unknown'}
                    </span>
                  </div>

                  <div className="text-xs font-mono space-y-1 text-slate-400 pt-1">
                    <div>MAC: <span className="text-slate-200">{dv.olt_mac || '-'}</span></div>
                    <div>IP: <span className="text-slate-200">{dv.source_ip || '-'}</span></div>
                    <div>Last seen: <span className="text-slate-200">{dv.last_seen ? new Date(dv.last_seen).toLocaleTimeString() : 'Never'}</span></div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── RECENT TRAPS TABLE ───────────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Recent Trap Events</h3>
            <p className="text-xs font-mono text-slate-400">Incoming SNMP v1/v2c trap notifications</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{traps.length} records</span>
        </div>

        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">OLT</th>
                <th className="py-3 px-4">Source IP</th>
                <th className="py-3 px-4">OID / Name</th>
                <th className="py-3 px-4">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!traps.length ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">No traps captured yet.</td>
                </tr>
              ) : (
                traps.slice(0, 100).map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500">{t.id}</td>
                    <td className="py-2.5 px-4 text-slate-300">{new Date(t.timestamp).toLocaleTimeString()}</td>
                    <td className="py-2.5 px-4 text-cyan-400 font-bold">{nameMap[t.olt_mac] || t.olt_id || '?'}</td>
                    <td className="py-2.5 px-4 text-slate-400">{t.source_ip}</td>
                    <td className="py-2.5 px-4 text-emerald-400">{t.oid_name || t.oid}</td>
                    <td className="py-2.5 px-4 text-slate-300 truncate max-w-sm" title={t.value}>{t.value || '-'}</td>
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
