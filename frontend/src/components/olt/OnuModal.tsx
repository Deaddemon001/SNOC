import React, { useState, useEffect, useMemo } from 'react'
import { X, Search, Radio, RefreshCw, Download, Activity, Wifi, WifiOff, Zap } from 'lucide-react'
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
  const [selectedPon, setSelectedPon] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')

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

  const isDyingGasp = (o: any) => {
    return (o.phase_state && String(o.phase_state).toLowerCase() === 'dyinggasp') ||
           (o.state && String(o.state).toLowerCase() === 'dyinggasp')
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

  const formatPonLabel = (pon: any) => {
    if (!pon && pon !== 0) return '—'
    const str = String(pon).trim()
    if (str.toLowerCase().startsWith('gpon')) return str
    if (str.includes('/')) return `GPON ${str}`
    return `GPON 0/${str}`
  }

  // Extract unique PON ports and counts
  const ponOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    onus.forEach(o => {
      const p = o.pon_port != null && o.pon_port !== '' ? String(o.pon_port).trim() : ''
      if (p) {
        counts[p] = (counts[p] || 0) + 1
      }
    })
    return Object.keys(counts)
      .sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10)
        const numB = parseInt(b.replace(/\D/g, ''), 10)
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB
        return a.localeCompare(b)
      })
      .map(p => ({
        value: p,
        label: formatPonLabel(p),
        count: counts[p]
      }))
  }, [onus])

  // Summary statistics calculation from snapshot data
  const stats = useMemo(() => {
    const total = onus.length
    const online = onus.filter(isOnline).length
    const offline = total - online
    const gasp = onus.filter(isDyingGasp).length
    const onlinePct = total > 0 ? ((online / total) * 100).toFixed(1) : '0'

    // Rx Power stats
    const validPowers = onus
      .map(o => (o.rx_power != null && o.rx_power !== '' ? Number(o.rx_power) : NaN))
      .filter(p => !isNaN(p))
    const avgRx = validPowers.length > 0
      ? (validPowers.reduce((a, b) => a + b, 0) / validPowers.length).toFixed(2)
      : null
    const weakestRx = validPowers.length > 0
      ? Math.min(...validPowers).toFixed(2)
      : null

    // Distance stats
    const validDistances = onus
      .map(o => {
        const d = o.distance_m ?? o.distance
        return (d != null && d !== '' ? Number(d) : NaN)
      })
      .filter(d => !isNaN(d) && d >= 0)
    const maxDist = validDistances.length > 0 ? Math.max(...validDistances) : null

    return {
      total,
      online,
      offline,
      gasp,
      onlinePct,
      avgRx,
      weakestRx,
      maxDist
    }
  }, [onus])

  // Filtered ONUs
  const filtered = useMemo(() => {
    return onus.filter(o => {
      // PON filter
      if (selectedPon) {
        const p = o.pon_port != null ? String(o.pon_port).trim() : ''
        if (p !== selectedPon) return false
      }

      // Status filter
      if (selectedStatus === 'online' && !isOnline(o)) return false
      if (selectedStatus === 'offline' && isOnline(o)) return false
      if (selectedStatus === 'gasp' && !isDyingGasp(o)) return false

      // Text search
      if (filter) {
        const q = filter.toLowerCase().trim()
        const match =
          (o.onu_name || '').toLowerCase().includes(q) ||
          (o.model || '').toLowerCase().includes(q) ||
          (o.serial_no || '').toLowerCase().includes(q) ||
          (o.pon_port != null && String(o.pon_port).toLowerCase().includes(q)) ||
          formatPonLabel(o.pon_port).toLowerCase().includes(q) ||
          String(o.onu_id || '').toLowerCase().includes(q) ||
          String(o.onu_index || '').toLowerCase().includes(q) ||
          (o.phase_state || '').toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [onus, selectedPon, selectedStatus, filter])

  // Export CSV
  const handleExportCsv = () => {
    if (!filtered.length) return
    const headers = ['PON Port', 'ONU ID', 'Status', 'Serial No', 'Name / Model', 'Rx Power (dBm)', 'Tx Power (dBm)', 'Distance (m)', 'Phase State']
    const rows = filtered.map(o => [
      `"${formatPonLabel(o.pon_port)}"`,
      `"${o.onu_id ?? ''}"`,
      `"${isOnline(o) ? 'ONLINE' : 'OFFLINE'}"`,
      `"${o.serial_no || ''}"`,
      `"${(o.onu_name || o.model || '').replace(/"/g, '""')}"`,
      o.rx_power != null ? Number(o.rx_power).toFixed(2) : '',
      o.tx_power != null ? Number(o.tx_power).toFixed(2) : '',
      (o.distance_m ?? o.distance) || '',
      `"${o.phase_state || ''}"`
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `onu_data_${(name || ip).replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-slate-100">{name} ({ip}) — ONU Inventory & Telemetry</h2>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              {loading
                ? 'Fetching ONUs from database...'
                : `Snapshot: ${pollTime ? new Date(pollTime).toLocaleString() : 'Latest database snapshot'} • ${onus.length} total ONUs`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={loading || !filtered.length}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              title="Export filtered list as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
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

        {/* Snapshot Summary Statistics Cards */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Total */}
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Activity className="w-3 h-3 text-slate-400" />
              <span>Total ONUs</span>
            </div>
            <div className="text-lg font-bold font-mono text-slate-100 mt-1">
              {stats.total}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              in snapshot
            </div>
          </div>

          {/* Online */}
          <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>Online ONUs</span>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
              {stats.online}{' '}
              <span className="text-xs font-normal text-emerald-500/80">({stats.onlinePct}%)</span>
            </div>
            <div className="text-[10px] text-emerald-500/70 font-mono">
              working state
            </div>
          </div>

          {/* Offline */}
          <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 flex items-center gap-1">
              <WifiOff className="w-3 h-3 text-rose-400" />
              <span>Offline ONUs</span>
            </div>
            <div className="text-lg font-bold font-mono text-rose-400 mt-1">
              {stats.offline}
            </div>
            <div className="text-[10px] text-rose-500/70 font-mono">
              unreachable
            </div>
          </div>

          {/* Dying Gasp */}
          <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Dying Gasp</span>
            </div>
            <div className="text-lg font-bold font-mono text-amber-400 mt-1">
              {stats.gasp}
            </div>
            <div className="text-[10px] text-amber-500/70 font-mono">
              power outages
            </div>
          </div>

          {/* Avg Rx Power */}
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
              Avg Rx Power
            </div>
            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              {stats.avgRx != null ? `${stats.avgRx} dBm` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono truncate" title={stats.weakestRx ? `Weakest: ${stats.weakestRx} dBm` : ''}>
              {stats.weakestRx ? `Min: ${stats.weakestRx} dBm` : 'optical signal'}
            </div>
          </div>

          {/* Farthest ONU */}
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
              Max Distance
            </div>
            <div className="text-lg font-bold font-mono text-amber-300 mt-1">
              {stats.maxDist != null ? formatDistance(stats.maxDist) : '—'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              fiber span
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Text search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search serial number, name, port, ONU ID..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* PON Port Filter Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-[170px]">
              <select
                value={selectedPon}
                onChange={e => setSelectedPon(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-cyan-300 focus:outline-none focus:border-cyan-500 font-mono cursor-pointer"
              >
                <option value="">All PON Ports ({onus.length})</option>
                {ponOptions.map(p => (
                  <option key={p.value} value={p.value}>
                    {p.label} ({p.count} ONUs)
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter Dropdown */}
            <div className="relative min-w-[140px]">
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono cursor-pointer"
              >
                <option value="">All Statuses ({onus.length})</option>
                <option value="online">Online Only ({stats.online})</option>
                <option value="offline">Offline Only ({stats.offline})</option>
                {stats.gasp > 0 && <option value="gasp">Dying Gasp ({stats.gasp})</option>}
              </select>
            </div>

            <span className="text-xs font-mono text-slate-400 whitespace-nowrap pl-1">
              {filtered.length} showing
            </span>
          </div>
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
                  <th className="py-2.5 px-3">Name / Model</th>
                  <th className="py-2.5 px-3">Rx Power</th>
                  <th className="py-2.5 px-3">Tx Power</th>
                  <th className="py-2.5 px-3">Distance</th>
                  <th className="py-2.5 px-3">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {!filtered.length ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      {onus.length === 0
                        ? 'No ONUs stored in database for this OLT yet. Click "Get ONU Info" on the OLT tab to poll live.'
                        : 'No ONUs matching the selected filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((o, idx) => {
                    const on = isOnline(o)
                    const gasp = isDyingGasp(o)
                    const rx = o.rx_power != null && o.rx_power !== '' ? Number(o.rx_power) : null
                    const tx = o.tx_power != null && o.tx_power !== '' ? Number(o.tx_power) : null

                    // Rx power styling
                    let rxColor = 'text-cyan-300'
                    if (rx != null) {
                      if (rx < -27) rxColor = 'text-rose-400'
                      else if (rx < -24) rxColor = 'text-amber-400'
                      else rxColor = 'text-emerald-400'
                    }

                    return (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 text-cyan-400 font-bold">
                          {formatPonLabel(o.pon_port || o.onu_index)}
                        </td>
                        <td className="py-2 px-3 text-slate-400">{o.onu_id ?? '—'}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1.5 ${
                              on
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : gasp
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                on ? 'bg-emerald-400' : gasp ? 'bg-amber-400' : 'bg-rose-400'
                              }`}
                            />
                            {on ? 'ONLINE' : gasp ? 'DYING GASP' : 'OFFLINE'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-orange-400 font-bold">{o.serial_no || '—'}</td>
                        <td className="py-2 px-3 text-slate-300 font-sans">{o.onu_name || o.model || '—'}</td>
                        <td className={`py-2 px-3 font-bold ${rxColor}`}>
                          {rx != null ? `${rx.toFixed(2)} dBm` : '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-400">
                          {tx != null ? `${tx.toFixed(2)} dBm` : '—'}
                        </td>
                        <td className="py-2 px-3 text-amber-400">
                          {formatDistance(o.distance_m ?? o.distance)}
                        </td>
                        <td className="py-2 px-3 text-slate-400 capitalize">
                          {o.phase_state || o.state || (on ? 'working' : 'offline')}
                        </td>
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
