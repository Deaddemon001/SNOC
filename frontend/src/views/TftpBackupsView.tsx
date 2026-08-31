import React, { useState, useEffect } from 'react'
import { HardDrive, Download, Trash2, ChevronDown, ChevronUp, Plus, Search, Filter } from 'lucide-react'
import { apiFetch, apiPost } from '../api'
import { useAuth } from '../context/AuthContext'
import { usePolling } from '../hooks/usePolling'
import { StatusMessage } from '../components/shared/StatusMessage'

export const TftpBackupsView: React.FC = () => {
  const { isAdmin } = useAuth()

  const [stats, setStats] = useState<any>({})
  const [config, setConfig] = useState<{ tftp_dir?: string; tftp_enabled?: boolean; tftp_port?: number }>({
    tftp_dir: '',
    tftp_enabled: true
  })
  const [files, setFiles] = useState<any[]>([])
  const [mappings, setMappings] = useState<any[]>([])

  const [macOpen, setMacOpen] = useState(false)
  const [filterOlt, setFilterOlt] = useState('')
  const [filterFile, setFilterFile] = useState('')

  const [mapMac, setMapMac] = useState('')
  const [mapHost, setMapHost] = useState('')
  const [mapDesc, setMapDesc] = useState('')

  const [cfgMsg, setCfgMsg] = useState({ text: '', ok: false })
  const [mapMsg, setMapMsg] = useState({ text: '', ok: false })

  const loadData = async () => {
    try {
      const s = await apiFetch('/api/tftp/stats')
      setStats(s || {})
    } catch (_) {}
    try {
      const fl = await apiFetch('/api/tftp/files')
      setFiles(Array.isArray(fl) ? fl : [])
    } catch (_) {}
  }

  usePolling(loadData, 10000)

  const loadConfig = async () => {
    try {
      const d = await apiFetch('/api/tftp/config')
      if (d) setConfig(prev => ({ ...prev, ...d }))
    } catch (_) {}
    try {
      const m = await apiFetch('/api/tftp/mac_mapping')
      setMappings(Array.isArray(m) ? m : [])
    } catch (_) {}
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const saveConfig = async () => {
    try {
      const r = await apiPost('/api/tftp/config', config)
      setCfgMsg({ text: r.message || 'Settings saved.', ok: r.success !== false })
    } catch (e: any) {
      setCfgMsg({ text: e.message || 'Save failed', ok: false })
    }
  }

  const addMapping = async () => {
    if (!mapMac.trim() || !mapHost.trim()) {
      setMapMsg({ text: 'MAC address and OLT Hostname are required.', ok: false })
      return
    }
    try {
      await apiPost('/api/tftp/mac_mapping/add', {
        olt_mac: mapMac.trim(),
        olt_hostname: mapHost.trim(),
        description: mapDesc.trim()
      })
      setMapMsg({ text: 'Mapping added.', ok: true })
      setMapMac('')
      setMapHost('')
      setMapDesc('')
      const m = await apiFetch('/api/tftp/mac_mapping')
      setMappings(Array.isArray(m) ? m : [])
    } catch (e: any) {
      setMapMsg({ text: e.message || 'Add mapping failed', ok: false })
    }
  }

  const deleteMapping = async (m: any) => {
    if (!confirm(`Remove mapping for MAC ${m.olt_mac}?`)) return
    try {
      await apiPost('/api/tftp/mac_mapping/delete', { olt_mac: m.olt_mac })
      const r = await apiFetch('/api/tftp/mac_mapping')
      setMappings(Array.isArray(r) ? r : [])
    } catch (e: any) {
      alert(e.message)
    }
  }

  const deleteFile = async (f: any) => {
    if (!confirm(`Delete backup record #${f.id} (${f.filename})?`)) return
    try {
      await apiPost(`/api/tftp/delete/${f.id}`, {})
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const formatBytes = (b: any) => {
    if (!b && b !== 0) return '-'
    const n = Number(b)
    if (n < 1024) return `${n} B`
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1048576).toFixed(2)} MB`
  }

  // OLT lists
  const oltCounts: Record<string, number> = {}
  files.forEach(f => {
    const k = f.olt_name || f.source_ip || '-'
    oltCounts[k] = (oltCounts[k] || 0) + 1
  })
  const oltList = Object.keys(oltCounts).sort()

  const filteredFiles = files.filter(f => {
    const of_ = filterOlt.toLowerCase().trim()
    const ff = filterFile.toLowerCase().trim()
    const oltMatch = !of_ || (f.olt_name || '').toLowerCase().includes(of_) || (f.source_ip || '').toLowerCase().includes(of_)
    const fileMatch = !ff || (f.filename || '').toLowerCase().includes(ff) || (f.stored_name || '').toLowerCase().includes(ff)
    return oltMatch && fileMatch
  })

  return (
    <div className="space-y-6">
      {/* ── 4 KPI CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Files Received</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{stats.total_files ?? '-'}</div>
          <div className="text-[10px] text-slate-500">all time stored</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Successful</div>
          <div className="text-2xl font-bold font-mono text-cyan-400">{stats.ok_files ?? '-'}</div>
          <div className="text-[10px] text-slate-500">completed transfers</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Total Size</div>
          <div className="text-2xl font-bold font-mono text-amber-400">{formatBytes(stats.total_size)}</div>
          <div className="text-[10px] text-slate-500">stored backup data</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">TFTP Port</div>
          <div className="text-2xl font-bold font-mono text-rose-400">UDP {config.tftp_port || 69}</div>
          <div className="text-[10px] text-slate-500">daemon listener</div>
        </div>
      </div>

      {/* ── SETTINGS & RECENT ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Settings */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            TFTP Server Configuration
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                Backup Storage Directory
              </label>
              <input
                type="text"
                value={config.tftp_dir || ''}
                onChange={e => setConfig({ ...config, tftp_dir: e.target.value })}
                placeholder="C:\SmartNOC\backups"
                disabled={!isAdmin}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.tftp_enabled !== false}
                onChange={e => setConfig({ ...config, tftp_enabled: e.target.checked })}
                disabled={!isAdmin}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>TFTP SERVER ENABLED</span>
            </label>
            <StatusMessage msg={cfgMsg.text} ok={cfgMsg.ok} />
            {isAdmin && (
              <button
                onClick={saveConfig}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all"
              >
                Save Settings
              </button>
            )}
          </div>
        </div>

        {/* Recent 5 Backups */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold tracking-wide text-slate-100">Recent Backups Received</h3>
          <div className="space-y-2">
            {!files.length ? (
              <div className="py-8 text-center text-xs font-mono text-slate-500">No backups received yet.</div>
            ) : (
              files.slice(0, 5).map(f => (
                <div
                  key={f.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between font-mono text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="text-cyan-400 font-bold">{f.filename}</div>
                    <div className="text-[10px] text-slate-500">
                      {f.olt_name || f.source_ip} &bull; {new Date(f.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className="text-amber-400 font-bold">{formatBytes(f.file_size)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── MAC MAPPING (COLLAPSIBLE) ────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div
          onClick={() => setMacOpen(!macOpen)}
          className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors"
        >
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">OLT MAC Address Mapping</h3>
            <p className="text-xs font-mono text-slate-400">Identify multiple OLTs behind NAT gateways by MAC address</p>
          </div>
          <button className="p-1 rounded-lg text-slate-400">
            {macOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {macOpen && (
          <div className="p-5 space-y-4">
            {isAdmin && (
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">OLT MAC</label>
                  <input
                    type="text"
                    value={mapMac}
                    onChange={e => setMapMac(e.target.value)}
                    placeholder="aa:bb:cc:dd:ee:ff"
                    className="w-44 px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">OLT Hostname</label>
                  <input
                    type="text"
                    value={mapHost}
                    onChange={e => setMapHost(e.target.value)}
                    placeholder="OLT-01"
                    className="w-40 px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={mapDesc}
                    onChange={e => setMapDesc(e.target.value)}
                    placeholder="Optional note"
                    className="w-48 px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  onClick={addMapping}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all"
                >
                  + Add Mapping
                </button>
              </div>
            )}

            <StatusMessage msg={mapMsg.text} ok={mapMsg.ok} />

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                  <tr>
                    <th className="py-2.5 px-4">MAC Address</th>
                    <th className="py-2.5 px-4">OLT Hostname</th>
                    <th className="py-2.5 px-4">Description</th>
                    {isAdmin && <th className="py-2.5 px-4 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {!mappings.length ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">No MAC mappings registered.</td>
                    </tr>
                  ) : (
                    mappings.map(m => (
                      <tr key={m.olt_mac} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 text-cyan-400">{m.olt_mac}</td>
                        <td className="py-2.5 px-4 text-slate-200 font-bold font-sans">{m.olt_hostname}</td>
                        <td className="py-2.5 px-4 text-slate-400">{m.description || '-'}</td>
                        {isAdmin && (
                          <td className="py-2.5 px-4 text-center">
                            <button
                              onClick={() => deleteMapping(m)}
                              className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px]"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── BACKUP FILES TABLE ───────────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Stored Backup Archives</h3>
            <p className="text-xs font-mono text-slate-400">Download configuration files or inspect payloads</p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <select
              value={filterOlt}
              onChange={e => setFilterOlt(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-950 border border-slate-800 text-cyan-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All OLTs</option>
              {oltList.map(o => (
                <option key={o} value={o}>{o} ({oltCounts[o]})</option>
              ))}
            </select>
            <input
              type="text"
              value={filterFile}
              onChange={e => setFilterFile(e.target.value)}
              placeholder="Search filename..."
              className="w-40 px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />
            <span className="text-xs font-mono text-slate-400">{filteredFiles.length} files</span>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">OLT</th>
                <th className="py-3 px-4">Source IP</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Stored As</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!filteredFiles.length ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">No backup files matching query.</td>
                </tr>
              ) : (
                filteredFiles.map(f => (
                  <tr key={f.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500">{f.id}</td>
                    <td className="py-2.5 px-4 text-slate-300">{new Date(f.timestamp).toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-cyan-400 font-bold">{f.olt_name || f.source_ip || '?'}</td>
                    <td className="py-2.5 px-4 text-slate-400">{f.source_ip || '-'}</td>
                    <td className="py-2.5 px-4 text-emerald-400">{f.filename || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-400">{f.stored_name || '-'}</td>
                    <td className="py-2.5 px-4 text-amber-400 font-bold">{formatBytes(f.file_size)}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        f.status === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {f.status ? f.status.toUpperCase() : 'OK'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {f.status === 'ok' && (
                          <a
                            href={`/api/tftp/download/${f.id}`}
                            className="px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> DL
                          </a>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => deleteFile(f)}
                            className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px]"
                          >
                            Del
                          </button>
                        )}
                      </div>
                    </td>
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
