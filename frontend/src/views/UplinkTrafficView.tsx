import React, { useState, useEffect } from 'react'
import { TrendingUp, Radio, Calendar, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'
import { apiFetch } from '../api'
import { useTheme } from '../context/ThemeContext'
import { usePolling } from '../hooks/usePolling'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

export const UplinkTrafficView: React.FC = () => {
  const { theme } = useTheme()

  const [profiles, setProfiles] = useState<any[]>([])
  const [selOltId, setSelOltId] = useState('')
  const [selPort, setSelPort] = useState('')
  const [selRange, setSelRange] = useState('last5')
  const [samples, setSamples] = useState<any[]>([])
  const [latestCards, setLatestCards] = useState<any[]>([])

  const currentProfile = profiles.find(p => String(p.id) === selOltId)

  useEffect(() => {
    async function loadProfiles() {
      try {
        const p = await apiFetch('/api/olt/profiles')
        setProfiles(Array.isArray(p) ? p : [])
      } catch (_) {}
    }
    loadProfiles()
  }, [])

  const portOptions = (() => {
    const ports: string[] = []
    for (let i = 1; i <= 16; i++) ports.push(`gigabitethernet 0/${i}`)
    const saved = (currentProfile?.uplink_ports || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
    saved.forEach((s: string) => {
      if (!ports.includes(s)) ports.unshift(s)
    })
    return ports
  })()

  const loadLatest = async () => {
    if (!currentProfile) return
    try {
      const stats = await apiFetch(`/api/olt/uplink_latest?ip=${encodeURIComponent(currentProfile.ip)}`)
      setLatestCards(Array.isArray(stats) ? stats.slice(0, 4) : [])
    } catch (_) {}
  }

  const loadHistory = async () => {
    if (!currentProfile || !selPort) {
      setSamples([])
      return
    }
    const ip = currentProfile.ip
    const iface = selPort !== '__saved__' ? selPort : ''
    let url: string
    if (['day', 'week', 'month'].includes(selRange)) {
      url = `/api/olt/uplink_aggregate?ip=${encodeURIComponent(ip)}&range=${encodeURIComponent(selRange)}`
      if (iface) url += `&interface=${encodeURIComponent(iface)}`
    } else {
      url = `/api/olt/uplink_stats?ip=${encodeURIComponent(ip)}&limit=5`
      if (iface) url += `&interface=${encodeURIComponent(iface)}`
    }
    try {
      const rows = await apiFetch(url)
      setSamples(Array.isArray(rows) ? rows : [])
    } catch (_) {
      setSamples([])
    }
  }

  usePolling(() => {
    if (selOltId) {
      loadLatest()
      if (selPort) loadHistory()
    }
  }, 30000)

  const onOltChange = (id: string) => {
    setSelOltId(id)
    setSelPort('')
    setLatestCards([])
    setSamples([])
  }

  const fmtRate = (kbps: any) => {
    if (kbps == null) return '-'
    const v = parseFloat(kbps)
    if (v >= 1000) return `${(v / 1000).toFixed(2)} Mbps`
    return `${v.toFixed(1)} Kbps`
  }

  const fmtBytes = (b: any) => {
    if (b == null) return '-'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let v = parseFloat(b), u = 0
    while (v >= 1024 && u < units.length - 1) {
      v /= 1024
      u++
    }
    return `${v.toFixed(2)} ${units[u]}`
  }

  const isDark = theme === 'dark'
  const tickColor = isDark ? '#64748b' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'

  const chartData = {
    labels: [...samples].reverse().map(r =>
      new Date(r.poll_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    ),
    datasets: [
      {
        label: 'Inbound RX',
        data: [...samples].reverse().map(r => r.rx_rate_kbps ?? r.rx_kbps ?? null),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      },
      {
        label: 'Outbound TX',
        data: [...samples].reverse().map(r => r.tx_rate_kbps ?? r.tx_kbps ?? null),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      }
    ]
  }

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { labels: { color: tickColor, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 } }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
      y: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 9, family: 'Share Tech Mono' }, callback: (v: any) => `${v} Kbps` },
        beginAtZero: true
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* ── FILTER HEADER PANEL ──────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Uplink Interface Traffic Telemetry
          </h2>
          <p className="text-xs font-mono text-slate-400">Bandwidth utilization and port carrier status</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Target OLT</label>
            <select
              value={selOltId}
              onChange={e => onOltChange(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="">- select OLT -</option>
              {profiles.map(p => (
                <option key={p.id} value={String(p.id)}>{p.name || p.ip}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Interface Port</label>
            <select
              value={selPort}
              onChange={e => {
                setSelPort(e.target.value)
                setTimeout(loadHistory, 50)
              }}
              disabled={!selOltId}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              <option value="">- select port -</option>
              <option value="__saved__">Saved profile ports: {currentProfile?.uplink_ports || '-'}</option>
              {portOptions.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Aggregation Range</label>
            <select
              value={selRange}
              onChange={e => {
                setSelRange(e.target.value)
                setTimeout(loadHistory, 50)
              }}
              disabled={!selOltId}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              <option value="last5">Last 5 Samples</option>
              <option value="day">Daily (Hourly avg)</option>
              <option value="week">Weekly (7 days)</option>
              <option value="month">Monthly (30 days)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── TRAFFIC TREND CHART ──────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[340px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Interface Bandwidth Rate Trend
          </h3>
          <span className="text-[10px] font-mono text-slate-500">
            {samples.length ? `${samples.length} aggregate samples` : 'Select OLT & port to visualize'}
          </span>
        </div>
        <div className="flex-1 min-h-[260px]">
          {!selOltId ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
              Select an OLT and Port above to inspect traffic curves.
            </div>
          ) : !samples.length ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
              No uplink samples captured yet. Use OLT Connect &rarr; Uplink to poll.
            </div>
          ) : (
            <Line data={chartData} options={chartOpts} />
          )}
        </div>
      </div>

      {/* ── INTERFACE STATUS CARDS ───────────────────────────────────── */}
      {latestCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {latestCards.map((c, i) => (
            <div key={c.interface || i} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 font-mono">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-cyan-400">{c.interface}</div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                  c.link_status === 'up' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {(c.link_status || 'unknown').toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">RX Rate</div>
                  <div className="font-bold text-emerald-400 flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" /> {fmtRate(c.rx_rate_kbps ?? c.rx_kbps)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">TX Rate</div>
                  <div className="font-bold text-orange-400 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> {fmtRate(c.tx_rate_kbps ?? c.tx_kbps)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">RX Total</div>
                  <div className="font-bold text-slate-300">{fmtBytes(c.rx_bytes ?? c.rx_total)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">TX Total</div>
                  <div className="font-bold text-slate-300">{fmtBytes(c.tx_bytes ?? c.tx_total)}</div>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                Polled: {new Date(c.poll_time).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
