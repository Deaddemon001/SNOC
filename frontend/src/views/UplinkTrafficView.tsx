import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { TrendingUp, RefreshCw, ArrowDownRight, ArrowUpRight, Radio, Activity, AlertTriangle, CheckCircle2, Play } from 'lucide-react'
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
import { apiFetch, apiPost } from '../api'
import { useTheme } from '../context/ThemeContext'
import { usePolling } from '../hooks/usePolling'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const COLOR_PALETTE = [
  '#00e5ff', // Cyan
  '#ff6b35', // Orange
  '#39ff14', // Neon Green
  '#ffd60a', // Yellow
  '#ff2d55', // Rose
  '#9d50bb', // Purple
  '#38bdf8', // Light Blue
  '#f43f5e'  // Crimson
]

export const UplinkTrafficView: React.FC = () => {
  const { theme } = useTheme()

  const [profiles, setProfiles] = useState<any[]>([])
  const [selOltId, setSelOltId] = useState<string>('')
  const [selPort, setSelPort] = useState<string>('__saved__')
  const [selRange, setSelRange] = useState<string>('last5')
  const [samples, setSamples] = useState<any[]>([])
  const [latestCards, setLatestCards] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [pollingLive, setPollingLive] = useState<boolean>(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const currentProfile = useMemo(() => {
    return profiles.find(p => String(p.id) === selOltId)
  }, [profiles, selOltId])

  // Initial load of profiles
  useEffect(() => {
    async function loadProfiles() {
      try {
        const p = await apiFetch('/api/olt/profiles')
        const list = Array.isArray(p) ? p : []
        setProfiles(list)
        if (list.length > 0 && !selOltId) {
          setSelOltId(String(list[0].id))
        }
      } catch (_) {}
    }
    loadProfiles()
  }, [])

  // Dynamic port options based on selected profile
  const portOptions = useMemo(() => {
    const ports: string[] = []
    for (let i = 1; i <= 16; i++) ports.push(`gigabitethernet 0/${i}`)
    const saved = (currentProfile?.uplink_ports || '')
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean)
    saved.forEach((s: string) => {
      if (!ports.includes(s)) ports.unshift(s)
    })
    return ports
  }, [currentProfile])

  // Load latest cards
  const loadLatest = useCallback(async () => {
    if (!currentProfile) return
    try {
      const stats = await apiFetch(`/api/olt/uplink_latest?ip=${encodeURIComponent(currentProfile.ip)}`)
      setLatestCards(Array.isArray(stats) ? stats.slice(0, 8) : [])
    } catch (_) {}
  }, [currentProfile])

  // Load historical samples for the chart
  const loadHistory = useCallback(async () => {
    if (!currentProfile) {
      setSamples([])
      return
    }
    setLoading(true)
    const ip = currentProfile.ip
    const iface = selPort !== '__saved__' ? selPort : ''
    let url: string
    if (['day', 'week', 'month'].includes(selRange)) {
      url = `/api/olt/uplink_aggregate?ip=${encodeURIComponent(ip)}&range=${encodeURIComponent(selRange)}`
      if (iface) url += `&interface=${encodeURIComponent(iface)}`
    } else {
      url = `/api/olt/uplink_stats?ip=${encodeURIComponent(ip)}&limit=${selRange === 'last20' ? 20 : 10}`
      if (iface) url += `&interface=${encodeURIComponent(iface)}`
    }
    try {
      const rows = await apiFetch(url)
      setSamples(Array.isArray(rows) ? rows : [])
    } catch (_) {
      setSamples([])
    } finally {
      setLoading(false)
    }
  }, [currentProfile, selPort, selRange])

  // Fetch when selectors change
  useEffect(() => {
    if (currentProfile) {
      loadLatest()
      loadHistory()
    }
  }, [currentProfile, selPort, selRange, loadLatest, loadHistory])

  // Background polling every 30s
  usePolling(() => {
    if (currentProfile) {
      loadLatest()
      loadHistory()
    }
  }, 30000)

  // Poll uplink live on-demand
  const handlePollUplinkNow = async () => {
    if (!currentProfile) return
    setPollingLive(true)
    setActionMsg({ text: `Polling uplink interfaces from ${currentProfile.name || currentProfile.ip}...`, ok: true })
    try {
      const savedPorts = (currentProfile.uplink_ports || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
      const res = await apiPost('/api/olt/poll_uplink', {
        id: currentProfile.id,
        interfaces: selPort && selPort !== '__saved__' ? [selPort] : savedPorts
      })
      if (res.success !== false) {
        setActionMsg({
          text: `Uplink poll succeeded: ${res.uplink_stats?.length || 0} interfaces polled in ${res.duration || '0'}s.`,
          ok: true
        })
        await loadLatest()
        await loadHistory()
      } else {
        setActionMsg({ text: `Uplink poll failed: ${res.error || 'Unknown error'}`, ok: false })
      }
    } catch (e: any) {
      setActionMsg({ text: `Poll request error: ${e.backendError || e.message}`, ok: false })
    } finally {
      setPollingLive(false)
      setTimeout(() => setActionMsg(null), 5000)
    }
  }

  const onOltChange = (id: string) => {
    setSelOltId(id)
    setSelPort('__saved__')
    setLatestCards([])
    setSamples([])
  }

  // Value formatting helpers
  const parseRateMbps = (val: any, fallbackBps?: any): number => {
    if (val != null && val !== '') {
      const n = Number(val)
      if (!isNaN(n)) return n
    }
    if (fallbackBps != null && fallbackBps !== '') {
      const n = Number(fallbackBps)
      if (!isNaN(n)) return n / 1_000_000
    }
    return 0
  }

  const fmtThroughput = (mbpsVal: any, bpsVal?: any) => {
    const mbps = parseRateMbps(mbpsVal, bpsVal)
    if (mbps >= 1000) {
      return `${(mbps / 1000).toFixed(2)} Gbps`
    }
    if (mbps >= 1) {
      return `${mbps.toFixed(2)} Mbps`
    }
    if (mbps > 0) {
      return `${(mbps * 1000).toFixed(1)} Kbps`
    }
    return '0.00 Mbps'
  }

  const fmtPackets = (p: any) => {
    if (p == null || p === '') return '—'
    const n = Number(p)
    return isNaN(n) ? '—' : n.toLocaleString()
  }

  const isDark = theme === 'dark'
  const tickColor = isDark ? '#64748b' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'

  // Prepare Chart.js datasets & labels
  const { chartData, insights } = useMemo(() => {
    if (!samples.length) {
      return {
        chartData: { labels: [], datasets: [] },
        insights: null
      }
    }

    // Sort samples chronologically (oldest to newest)
    const sorted = [...samples].sort((a, b) => {
      const ta = new Date(a.poll_time).getTime()
      const tb = new Date(b.poll_time).getTime()
      return ta - tb
    })

    // Extract unique timestamps for the X-axis labels
    const timeLabelsMap = new Map<string, string>()
    sorted.forEach(s => {
      const raw = s.poll_time
      if (!timeLabelsMap.has(raw)) {
        const d = new Date(raw)
        const formatted = d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
        timeLabelsMap.set(raw, formatted)
      }
    })

    const rawTimeList = Array.from(timeLabelsMap.keys())
    const xLabels = Array.from(timeLabelsMap.values())

    // Extract unique interfaces present in the samples
    const ifaceList = Array.from(new Set(sorted.map(s => s.interface || 'uplink').filter(Boolean)))

    const datasets: any[] = []
    let peakIn = 0
    let peakOut = 0
    let lowIn = Infinity
    let lowOut = Infinity

    ifaceList.forEach((ifName, idx) => {
      const ifSamples = sorted.filter(s => (s.interface || 'uplink') === ifName)
      const sampleByTime = new Map<string, any>()
      ifSamples.forEach(s => sampleByTime.set(s.poll_time, s))

      const inData = rawTimeList.map(t => {
        const s = sampleByTime.get(t)
        if (!s) return null
        const val = parseRateMbps(s.in_mbps ?? s.rx_rate_kbps, s.in_bps ?? s.rx_kbps)
        if (val > peakIn) peakIn = val
        if (val < lowIn) lowIn = val
        return val
      })

      const outData = rawTimeList.map(t => {
        const s = sampleByTime.get(t)
        if (!s) return null
        const val = parseRateMbps(s.out_mbps ?? s.tx_rate_kbps, s.out_bps ?? s.tx_kbps)
        if (val > peakOut) peakOut = val
        if (val < lowOut) lowOut = val
        return val
      })

      const color = COLOR_PALETTE[idx % COLOR_PALETTE.length]
      const labelPrefix = ifaceList.length > 1 ? `${ifName} ` : ''

      // Inbound RX dataset
      datasets.push({
        label: `${labelPrefix}IN (Mbps)`,
        data: inData,
        borderColor: color,
        backgroundColor: `${color}15`,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: ifaceList.length === 1
      })

      // Outbound TX dataset
      datasets.push({
        label: `${labelPrefix}OUT (Mbps)`,
        data: outData,
        borderColor: color,
        borderDash: [5, 5],
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.3,
        fill: false
      })
    })

    return {
      chartData: {
        labels: xLabels,
        datasets
      },
      insights: {
        peakIn: peakIn.toFixed(2),
        peakOut: peakOut.toFixed(2),
        lowIn: lowIn === Infinity ? '0.00' : lowIn.toFixed(2),
        lowOut: lowOut === Infinity ? '0.00' : lowOut.toFixed(2),
        sampleCount: sorted.length
      }
    }
  }, [samples])

  const chartOpts = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: tickColor,
            font: { size: 10, family: 'Share Tech Mono' },
            boxWidth: 12,
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 21, 32, 0.95)',
          titleFont: { size: 11, family: 'Share Tech Mono' },
          bodyFont: { size: 11, family: 'Share Tech Mono' },
          borderColor: 'rgba(0, 229, 255, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx: any) => {
              const label = ctx.dataset.label || ''
              const val = ctx.parsed.y
              return ` ${label}: ${val != null ? val.toFixed(2) : '—'} Mbps`
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            maxTicksLimit: 10,
            font: { size: 9, family: 'Share Tech Mono' }
          }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 9, family: 'Share Tech Mono' },
            callback: (v: any) => `${v} Mbps`
          },
          beginAtZero: true
        }
      }
    }
  }, [tickColor, gridColor])

  // Key to ensure clean canvas re-initialization on selector changes
  const chartKey = `uplink-chart-${selOltId}-${selPort}-${selRange}-${theme}-${samples.length}`

  return (
    <div className="space-y-6">
      {/* ── FILTER HEADER PANEL ──────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Uplink Interface Traffic Telemetry
            </h2>
            <p className="text-xs font-mono text-slate-400">
              Live bandwidth utilization, Mbps throughput curves, and carrier status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePollUplinkNow}
              disabled={pollingLive || !currentProfile}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 transition-all flex items-center gap-1.5"
              title="Execute live uplink poll on target OLT"
            >
              {pollingLive ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{pollingLive ? 'Polling OLT...' : 'Poll Uplink Now'}</span>
            </button>
            <button
              onClick={() => {
                loadLatest()
                loadHistory()
              }}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
              title="Refresh chart and cards from database"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Action message */}
        {actionMsg && (
          <div
            className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
              actionMsg.ok
                ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-950/20 text-rose-400 border-rose-500/30'
            }`}
          >
            {actionMsg.ok ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{actionMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Target OLT
            </label>
            <select
              value={selOltId}
              onChange={e => onOltChange(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">- select OLT -</option>
              {profiles.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.name || p.ip} ({p.ip})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Interface Port
            </label>
            <select
              value={selPort}
              onChange={e => setSelPort(e.target.value)}
              disabled={!selOltId}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
            >
              <option value="__saved__">
                All Saved Ports: {currentProfile?.uplink_ports || 'all'}
              </option>
              {portOptions.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Aggregation Range
            </label>
            <select
              value={selRange}
              onChange={e => setSelRange(e.target.value)}
              disabled={!selOltId}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
            >
              <option value="last5">Last 5 Samples (Realtime)</option>
              <option value="last20">Last 20 Samples</option>
              <option value="day">Daily (Hourly Avg - 24h)</option>
              <option value="week">Weekly (Daily Avg - 7 Days)</option>
              <option value="month">Monthly (Daily Avg - 30 Days)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── TRAFFIC TREND CHART ──────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[380px]">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              {selPort === '__saved__' ? 'All Configured Uplink Interfaces' : selPort} — Bandwidth Curve
            </h3>
            {insights && (
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Peak IN: <span className="text-emerald-400 font-bold">{insights.peakIn} Mbps</span> • Peak OUT:{' '}
                <span className="text-orange-400 font-bold">{insights.peakOut} Mbps</span> • Low IN:{' '}
                <span className="text-slate-300">{insights.lowIn} Mbps</span> • Low OUT:{' '}
                <span className="text-slate-300">{insights.lowOut} Mbps</span>
              </p>
            )}
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            {samples.length ? `${samples.length} telemetry points` : 'Select OLT to visualize'}
          </span>
        </div>

        <div className="flex-1 min-h-[290px] relative">
          {!selOltId ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
              Select an OLT above to inspect uplink traffic curves.
            </div>
          ) : loading && !samples.length ? (
            <div className="h-full flex flex-col items-center justify-center text-xs font-mono text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <span>Loading uplink traffic samples...</span>
            </div>
          ) : !samples.length ? (
            <div className="h-full flex flex-col items-center justify-center text-xs font-mono text-slate-500 gap-2">
              <Activity className="w-6 h-6 text-slate-600" />
              <span>No uplink samples captured yet for this selection.</span>
              <button
                onClick={handlePollUplinkNow}
                disabled={pollingLive}
                className="mt-1 px-3 py-1 text-xs font-bold rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20"
              >
                Click here to poll uplink now
              </button>
            </div>
          ) : (
            <div className="w-full h-full min-h-[290px]">
              <Line key={chartKey} data={chartData} options={chartOpts} />
            </div>
          )}
        </div>
      </div>

      {/* ── INTERFACE STATUS CARDS ───────────────────────────────────── */}
      {latestCards.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Latest Interface Telemetry ({latestCards.length} ports)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {latestCards.map((c, i) => {
              const isUp = (c.link_status || '').toLowerCase() === 'up'
              const inThroughput = fmtThroughput(c.in_mbps, c.in_bps)
              const outThroughput = fmtThroughput(c.out_mbps, c.out_bps)

              return (
                <div
                  key={c.interface || i}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 font-mono hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-cyan-400 truncate max-w-[140px]" title={c.interface}>
                      {c.interface}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        isUp
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {(c.link_status || 'UNKNOWN').toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-500">Inbound RX</div>
                      <div className="font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                        <ArrowDownRight className="w-3 h-3 flex-shrink-0" />
                        <span>{inThroughput}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Outbound TX</div>
                      <div className="font-bold text-orange-400 flex items-center gap-1 mt-0.5">
                        <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                        <span>{outThroughput}</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500">RX Packets</div>
                      <div className="font-bold text-slate-300 mt-0.5">{fmtPackets(c.in_pkts)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">TX Packets</div>
                      <div className="font-bold text-slate-300 mt-0.5">{fmtPackets(c.out_pkts)}</div>
                    </div>

                    {(c.in_errors != null || c.out_errors != null) && (
                      <div className="col-span-2 pt-1 border-t border-slate-800 flex justify-between text-[10px] text-slate-400">
                        <span>Err IN: <strong className={Number(c.in_errors) > 0 ? 'text-rose-400' : 'text-slate-300'}>{c.in_errors ?? 0}</strong></span>
                        <span>Err OUT: <strong className={Number(c.out_errors) > 0 ? 'text-rose-400' : 'text-slate-300'}>{c.out_errors ?? 0}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                    Polled: {c.poll_time ? new Date(c.poll_time).toLocaleTimeString() : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
