import React, { useState } from 'react'
import { Search, X, Radio, Activity, Compass, Gauge, AlertCircle } from 'lucide-react'
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

export const OntLookupView: React.FC = () => {
  const { theme } = useTheme()

  const [serial, setSerial] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState({ text: '', ok: false })

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const sn = serial.trim()
    if (!sn) {
      setStatusMsg({ text: 'Please enter an ONT serial number.', ok: false })
      return
    }
    setLoading(true)
    setStatusMsg({ text: '', ok: false })
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

      {/* KPI Summary Cards */}
      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
          <div className={`p-4 rounded-2xl border space-y-1 ${
            isOnline(latest) ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'
          }`}>
            <div className="text-[10px] font-mono uppercase text-slate-400">Latest Status</div>
            <div className="text-xl font-bold font-mono flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline(latest) ? 'bg-emerald-400 shadow-glow-emerald' : 'bg-rose-400 shadow-glow-rose'} animate-pulse`} />
              <span className={isOnline(latest) ? 'text-emerald-400' : 'text-rose-400'}>
                {isOnline(latest) ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400 truncate">
              {latest.phase_state || (isOnline(latest) ? 'working' : 'offline')}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Optical Distance</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {formatDistance(latest.distance_m ?? latest.distance)}
            </div>
            <div className="text-xs font-mono text-slate-500">last optical measurement</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <span>Optical Rx Power</span>
            </div>
            <div className={`text-xl font-bold font-mono ${rxColor(latest.rx_power)}`}>
              {latest.rx_power != null ? `${Number(latest.rx_power).toFixed(2)} dBm` : '—'}
            </div>
            <div className="text-xs font-mono text-slate-500">Rx sensitivity level</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>OLT &amp; Port</span>
            </div>
            <div className="text-base font-bold font-mono text-slate-100 truncate">
              {latest.olt_name || latest.olt_ip || '—'}
            </div>
            <div className="text-xs font-mono text-cyan-400">
              {latest.pon_port != null ? `PON ${latest.pon_port}` : `ONU #${latest.onu_id || '?'}`}
            </div>
          </div>
        </div>
      )}

      {/* Rx Power Chart */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[300px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Optical Level (Rx Power Trend)
          </h3>
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
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">No records found.</td>
                </tr>
              ) : (
                rows.slice(0, 300).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-300">
                      {r.poll_time ? new Date(r.poll_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1.5 ${
                        isOnline(r)
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline(r) ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {isOnline(r) ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td className={`py-2.5 px-4 font-bold ${rxColor(r.rx_power)}`}>
                      {r.rx_power != null ? `${Number(r.rx_power).toFixed(2)} dBm` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-amber-400">
                      {formatDistance(r.distance_m ?? r.distance)}
                    </td>
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
