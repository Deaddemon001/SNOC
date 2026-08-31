import React, { useState, useEffect } from 'react'
import { X, Search, Radio, RefreshCw } from 'lucide-react'
import { apiFetch } from '../../api'

interface OnuModalProps {
  name: string
  ip: string
  onus: any[]
  pollTime: string | null
  onClose: () => void
}

export const OnuModal: React.FC<OnuModalProps> = ({ name, ip, onus: initialOnus, pollTime: initialPollTime, onClose }) => {
  const [onus, setOnus] = useState<any[]>(initialOnus || [])
  const [pollTime, setPollTime] = useState<string | null>(initialPollTime)
  const [loading, setLoading] = useState<boolean>(!initialOnus || initialOnus.length === 0)
  const [filter, setFilter] = useState('')

  const fetchOnus = async () => {
    if (!ip) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/olt/onus?ip=${encodeURIComponent(ip)}`)
      const list = Array.isArray(res) ? res : []
      setOnus(list)
      if (list.length > 0 && list[0].poll_time) {
        setPollTime(list[0].poll_time)
      }
    } catch (_) {}
    finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialOnus || initialOnus.length === 0) {
      fetchOnus()
    } else {
      setOnus(initialOnus)
      setPollTime(initialPollTime)
      setLoading(false)
    }
  }, [ip, initialOnus])

  const isOnline = (o: any) => {
    if (o.online === 1 || o.online === '1' || o.online === true) return true
    if (o.phase_state && String(o.phase_state).toLowerCase() === 'working') return true
    return false
  }

  const formatDistance = (dist: any) => {
    if (dist == null || dist === undefined || dist === '') return '—'
    const num = Number(dist)
    if (isNaN(num) || num < 0) return '—'
    if (num >= 1000) {
      return `${num.toLocaleString()} m (${(num / 1000).toFixed(2)} km)`
    }
    return `${num.toLocaleString()} m`
  }

  const filtered = onus.filter(o => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      (o.onu_name || '').toLowerCase().includes(q) ||
      (o.serial_no || '').toLowerCase().includes(q) ||
      (o.pon_port || '').toLowerCase().includes(q) ||
      String(o.onu_id || '').toLowerCase().includes(q) ||
      String(o.onu_index || '').toLowerCase().includes(q)
    )
  })

  const onlineCount = onus.filter(isOnline).length
  const offlineCount = onus.length - onlineCount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-slate-100">{name} ({ip})</h2>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              {loading ? 'Fetching ONUs from database...' : `Polled: ${pollTime ? new Date(pollTime).toLocaleString() : 'Latest database snapshot'} • ${onus.length} total (${onlineCount} online, ${offlineCount} offline)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchOnus}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
              title="Refresh ONUs from database"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter by serial number, name, port, or ONU ID..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
          <span className="text-xs font-mono text-slate-400">{filtered.length} showing</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400 font-mono flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <span>Loading ONUs from database...</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">PON</th>
                  <th className="py-2.5 px-3">ONU ID</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Serial No</th>
                  <th className="py-2.5 px-3">Name / Desc</th>
                  <th className="py-2.5 px-3">Rx Power</th>
                  <th className="py-2.5 px-3">Distance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {!filtered.length ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      {onus.length === 0 ? 'No ONUs stored in database for this OLT yet. Click "Get ONU Info" to poll live.' : 'No ONUs matching filter.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((o, idx) => {
                    const on = isOnline(o)
                    return (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-cyan-400">{o.pon_port ? `GPON 0/${o.pon_port}` : (o.onu_index || '—')}</td>
                        <td className="py-2 px-3 text-slate-400">{o.onu_id ?? '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1.5 ${
                            on ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            {on ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-orange-400 font-bold">{o.serial_no || '—'}</td>
                        <td className="py-2 px-3 text-slate-300 font-sans">{o.onu_name || o.model || '—'}</td>
                        <td className="py-2 px-3 font-bold text-cyan-300">
                          {o.rx_power != null ? `${Number(o.rx_power).toFixed(2)} dBm` : '—'}
                        </td>
                        <td className="py-2 px-3 text-amber-400">{formatDistance(o.distance_m ?? o.distance)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
