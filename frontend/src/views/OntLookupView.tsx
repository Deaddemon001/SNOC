import React, { useState } from 'react'
import { Search, X, Radio, Activity, Compass, Gauge, AlertCircle, Zap, RefreshCw, Wifi, WifiOff } from 'lucide-react'
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
import { apiFetch } from '../api'
import { useTheme } from '../context/ThemeContext'
import { StatusMessage } from '../components/shared/StatusMessage'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

interface LiveResult {
  success: boolean
  online?: number
  phase_state?: string
  admin_state?: string
  omcc_state?: string
  rx_power?: number | null
  distance_m?: number | null
  poll_time?: string
  method?: string
  duration?: number
  olt_name?: string
  olt_ip?: string
  pon_port?: string
  onu_id?: string
  error?: string
}

export const OntLookupView: React.FC = () => {
  const { theme } = useTheme()

  const [serial, setSerial] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState({ text: '', ok: false })

  // Live status state
  const [liveResult, setLiveResult] = useState<LiveResult | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const sn = serial.trim()
    if (!sn) {
      setStatusMsg({ text: 'Please enter an ONT serial number.', ok: false })
      return
    }
    setLoading(true)
    setStatusMsg({ text: '', ok: false })
    setLiveResult(null)
    setLiveError('')
    try {
      const data = await apiFetch(`/api/onu/history?serial_no=${encodeURIComponent(sn)}`)
      const list = Array.isArray(data) ? data : []
      setRows(list)
      if (!list.length) {
        setStatusMsg({ text: `No polling history found for serial "${sn}".`, ok: false })
      } else {
        setStatusMsg({ text: `${list.length} historical records retrieved for ${sn}`, ok: true })
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Lookup failed', ok: false })
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setSerial('')
    setRows([])
    setStatusMsg({ text: '', ok: false })
    setLiveResult(null)
    setLiveError('')
  }

  const handleGetLiveStatus = async () => {
    const latest = rows[0]
    if (!latest) return

    setLiveLoading(true)
    setLiveError('')
    setLiveResult(null)

    try {
      const payload = {
        olt_name:  latest.olt_name  || '',
        olt_ip:    latest.olt_ip    || '',
        pon_port:  String(latest.pon_port  ?? ''),
        onu_id:    String(latest.onu_id    ?? ''),
        serial_no: latest.serial_no || serial.trim(),
      }
      const result: LiveResult = await apiFetch('/api/onu/live_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setLiveResult(result)
      if (result.success) {
        const freshRow = {
          poll_time:   result.poll_time,
          online:      result.online,
          phase_state: result.phase_state,
          admin_state: result.admin_state,
          omcc_state:  result.omcc_state,
          rx_power:    result.rx_power,
          distance_m:  result.distance_m,
          olt_name:    result.olt_name  ?? latest.olt_name,
          olt_ip:      result.olt_ip    ?? latest.olt_ip,
          pon_port:    result.pon_port  ?? latest.pon_port,
          onu_id:      result.onu_id    ?? latest.onu_id,
          serial_no:   latest.serial_no || serial.trim(),
          _live: true,
        }
        setRows(prev => [freshRow, ...prev])
      } else {
        setLiveError(result.error || 'Live query failed')
      }
    } catch (err: any) {
      setLiveError(err.message || 'Network error')
    } finally {
      setLiveLoading(false)
    }
  }

  const latest = rows.length ? rows[0] : null

  const isOnline = (r: any) => {
    if (!r) return false
    if (r.online === 1 || r.online === '1' || r.online === true) return true
    if (r.phase_state && String(r.phase_state).toLowerCase() === 'working') return true
    return false
  }

  const formatDistance = (dist: any) => {
    if (dist == null || dist === undefined || dist === '') return '—'
    const num = Number(dist)
    if (isNaN(num) || num < 0) return '—'
    if (num >= 1000) {
      const km = (num / 1000).toFixed(2)
      return `${num.toLocaleString()} m (${km} km)`
    }
    return `${num.toLocaleString()} m`
  }

  const rxColor = (rx: any) => {
    if (rx == null) return 'text-slate-400'
    const n = Number(rx)
    if (n > -25) return 'text-emerald-400'
    if (n > -28) return 'text-amber-400'
    return 'text-rose-400'
  }

  const isDark = theme === 'dark'
  const tickColor = isDark ? '#64748b' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'

  const chartData = {
    labels: [...rows].reverse().map(r =>
      new Date(r.poll_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    ),
    datasets: [
      {
        label: 'Rx Power (dBm)',
        data: [...rows].reverse().map(r => r.rx_power),
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.08)',
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
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9, family: 'Share Tech Mono' } } }
    }
  }

  const canLive = !!latest && !!(latest.olt_name || latest.olt_ip) && latest.pon_port != null && latest.onu_id != null

  return (
    <div className="space-y-6">
      {/* Search Bar Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-cyan-400" />
            ONT Serial Number Lookup
          </h2>
          <p className="text-xs font-mono text-slate-400">Query stored optical levels, distance measurements, and online states</p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={serial}
              onChange={e => setSerial(e.target.value)}
              placeholder="e.g. VSOL12345678 or HWTC..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 tracking-wider uppercase transition-all shadow-md shadow-cyan-500/20"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            >
              Clear
            </button>
          </div>
        </form>

        <StatusMessage msg={statusMsg.text} ok={statusMsg.ok} />
      </div>

      {/* KPI Cards + Live Status */}
      {latest && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-2xl border space-y-1 ${isOnline(latest) ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'}`}>
              <div className="text-[10px] font-mono uppercase text-slate-400">Latest Status</div>
              <div className="text-xl font-bold font-mono flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline(latest) ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`} />
                <span className={isOnline(latest) ? 'text-emerald-400' : 'text-rose-400'}>
                  {isOnline(latest) ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400 truncate flex items-center gap-1">
                {latest.phase_state || (isOnline(latest) ? 'working' : 'offline')}
                {latest._live && (
                  <span className="px-1 py-0.5 text-[9px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded font-bold">LIVE</span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-amber-400" /><span>Optical Distance</span>
              </div>
              <div className="text-xl font-bold font-mono text-amber-400">{formatDistance(latest.distance_m ?? latest.distance)}</div>
              <div className="text-xs font-mono text-slate-500">last optical measurement</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" /><span>Optical Rx Power</span>
              </div>
              <div className={`text-xl font-bold font-mono ${rxColor(latest.rx_power)}`}>
                {latest.rx_power != null ? `${Number(latest.rx_power).toFixed(2)} dBm` : '—'}
              </div>
              <div className="text-xs font-mono text-slate-500">Rx sensitivity level</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-emerald-400" /><span>OLT &amp; Port</span>
              </div>
              <div className="text-base font-bold font-mono text-slate-100 truncate">{latest.olt_name || latest.olt_ip || '—'}</div>
              <div className="text-xs font-mono text-cyan-400">
                {latest.pon_port != null ? `PON ${latest.pon_port}` : `ONU #${latest.onu_id || '?'}`}
              </div>
            </div>
          </div>

          {/* Live Status Panel */}
          {canLive && (
            <div className="rounded-2xl bg-slate-900/80 border border-violet-500/30 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-bold text-slate-100">Live ONT Status</span>
                  <span className="text-[10px] font-mono text-slate-500">— real-time OLT query</span>
                </div>
                <button
                  id="btn-get-live-status"
                  onClick={handleGetLiveStatus}
                  disabled={liveLoading}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs tracking-wider uppercase transition-all ${liveLoading ? 'bg-violet-900/40 text-violet-400 border border-violet-500/30 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/25'}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
                  {liveLoading ? 'Querying OLT…' : 'Get Live Status'}
                </button>
              </div>

              {liveError && (
                <div className="px-5 py-3 flex items-center gap-2 text-rose-400 text-xs font-mono bg-rose-950/20">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{liveError}</span>
                </div>
              )}

              {liveLoading && (
                <div className="px-5 py-6 flex items-center justify-center gap-3 text-xs font-mono text-violet-400">
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1">Connecting to OLT…</span>
                </div>
              )}

              {liveResult && liveResult.success && !liveLoading && (
                <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className={`col-span-2 sm:col-span-1 flex flex-col items-center justify-center p-4 rounded-xl border ${liveResult.online ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-rose-950/30 border-rose-500/40'}`}>
                    {liveResult.online ? <Wifi className="w-7 h-7 text-emerald-400 mb-2" /> : <WifiOff className="w-7 h-7 text-rose-400 mb-2" />}
                    <span className={`text-sm font-bold font-mono ${liveResult.online ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {liveResult.online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 mt-0.5">{liveResult.phase_state || '—'}</span>
                  </div>

                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] font-mono uppercase text-slate-500 flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-cyan-400" />Rx Power
                    </div>
                    <div className={`text-lg font-bold font-mono ${rxColor(liveResult.rx_power)}`}>
                      {liveResult.rx_power != null ? `${Number(liveResult.rx_power).toFixed(2)}` : '—'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">dBm</div>
                  </div>

                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] font-mono uppercase text-slate-500 flex items-center gap-1">
                      <Compass className="w-3 h-3 text-amber-400" />Distance
                    </div>
                    <div className="text-lg font-bold font-mono text-amber-400">
                      {liveResult.distance_m != null ? liveResult.distance_m.toLocaleString() : '—'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">meters</div>
                  </div>

                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] font-mono uppercase text-slate-500">Admin</div>
                    <div className="text-sm font-bold font-mono text-slate-200 truncate">{liveResult.admin_state || '—'}</div>
                    <div className="text-[10px] font-mono text-slate-500">admin state</div>
                  </div>

                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] font-mono uppercase text-slate-500">OMCC</div>
                    <div className="text-sm font-bold font-mono text-slate-200 truncate">{liveResult.omcc_state || '—'}</div>
                    <div className="text-[10px] font-mono text-slate-500">omcc state</div>
                  </div>

                  <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] font-mono uppercase text-slate-500 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-violet-400" />Meta
                    </div>
                    <div className="text-xs font-bold font-mono text-violet-300">{liveResult.method || '—'}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {liveResult.duration != null ? `${liveResult.duration}s` : ''} · {liveResult.poll_time ? new Date(liveResult.poll_time).toLocaleTimeString() : ''}
                    </div>
                  </div>
                </div>
              )}

              {!liveResult && !liveLoading && !liveError && (
                <div className="px-5 py-4 text-xs font-mono text-slate-500">
                  Click <span className="text-violet-400 font-bold">Get Live Status</span> to connect to{' '}
                  <span className="text-slate-300">{latest.olt_name || latest.olt_ip}</span> (PON {latest.pon_port}, ONU {latest.onu_id}) and fetch real-time telemetry.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rx Power Chart */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[300px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Optical Level (Rx Power Trend)</h3>
          <span className="text-[10px] font-mono text-slate-500">
            {rows.length ? `${rows.length} poll measurements` : 'Search to populate'}
          </span>
        </div>
        <div className="flex-1 min-h-[220px]">
          {rows.length ? (
            <Line data={chartData} options={chartOpts} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
              No data yet. Search for an ONT serial above.
            </div>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Measurement History</h3>
            <p className="text-xs font-mono text-slate-400">Full audit log of optical measurements</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{rows.length} records</span>
        </div>
        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 px-4">Poll Time</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Optical Rx</th>
                <th className="py-3 px-4">Distance</th>
                <th className="py-3 px-4">OLT Name</th>
                <th className="py-3 px-4">OLT IP</th>
                <th className="py-3 px-4">PON Port</th>
                <th className="py-3 px-4">ONU ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!rows.length ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500">No records found.</td></tr>
              ) : (
                rows.slice(0, 300).map((r, i) => (
                  <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${r._live ? 'bg-violet-950/10' : ''}`}>
                    <td className="py-2.5 px-4 text-slate-300">
                      <span className="flex items-center gap-1.5">
                        {r.poll_time ? new Date(r.poll_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
                        {r._live && (
                          <span className="px-1 py-0.5 text-[9px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded font-bold leading-none">LIVE</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1.5 ${isOnline(r) ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline(r) ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {isOnline(r) ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td className={`py-2.5 px-4 font-bold ${rxColor(r.rx_power)}`}>
                      {r.rx_power != null ? `${Number(r.rx_power).toFixed(2)} dBm` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-amber-400">{formatDistance(r.distance_m ?? r.distance)}</td>
                    <td className="py-2.5 px-4 text-slate-200">{r.olt_name || '—'}</td>
                    <td className="py-2.5 px-4 text-cyan-400">{r.olt_ip || '—'}</td>
                    <td className="py-2.5 px-4 text-slate-300">{r.pon_port != null ? `PON ${r.pon_port}` : '—'}</td>
                    <td className="py-2.5 px-4 text-slate-400">{r.onu_id ?? '—'}</td>
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
