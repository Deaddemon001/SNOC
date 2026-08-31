import React, { useState, useEffect } from 'react'
import {
  Server,
  Plus,
  Play,
  Eye,
  TrendingUp,
  Edit2,
  Trash2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCw,
  Layers
} from 'lucide-react'
import { apiFetch, apiPost } from '../api'
import { useAuth } from '../context/AuthContext'
import { usePolling } from '../hooks/usePolling'
import { StatusMessage } from '../components/shared/StatusMessage'
import { OnuModal } from '../components/olt/OnuModal'

export const OltConnectView: React.FC = () => {
  const { isAdmin } = useAuth()

  const [profiles, setProfiles] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])

  const [configOpen, setConfigOpen] = useState(true)
  const [editId, setEditId] = useState<string>('')
  const [pollingId, setPollingId] = useState<number | null>(null)

  // Profile Form
  const emptyForm = {
    name: '',
    ip: '',
    olt_model: 'V1600G1',
    conn_type: 'auto',
    ssh_port: '22',
    telnet_port: '23',
    username: '',
    password: '',
    enable_pass: '',
    uplink_ports: 'gigabitethernet 0/10'
  }
  const [form, setForm] = useState(emptyForm)

  // Job Form
  const emptyJob = {
    profile_id: '',
    poll_type: 'onu',
    run_mode: 'repeat',
    start_at: '',
    interval_min: '60',
    selected_ports: ''
  }
  const [job, setJob] = useState(emptyJob)
  const [editJobId, setEditJobId] = useState<string>('')

  // Modals & Messages
  const [profileMsg, setProfileMsg] = useState({ text: '', ok: false })
  const [actionMsg, setActionMsg] = useState({ text: '', ok: false, loading: false })
  const [jobMsg, setJobMsg] = useState({ text: '', ok: false })

  const [onuModal, setOnuModal] = useState<{ open: boolean; ip: string; name: string; onus: any[]; pollTime: string | null }>({
    open: false,
    ip: '',
    name: '',
    onus: [],
    pollTime: null
  })

  const [sessionPage, setSessionPage] = useState(0)
  const sessionPageSize = 15

  const loadData = async () => {
    try {
      const p = await apiFetch('/api/olt/profiles')
      setProfiles(Array.isArray(p) ? p : [])
    } catch (_) {}
    try {
      const s = await apiFetch('/api/olt/sessions')
      setSessions(Array.isArray(s) ? s : [])
    } catch (_) {}
  }

  usePolling(loadData, 15000)

  const loadJobs = async () => {
    try {
      const j = await apiFetch('/api/olt/jobs')
      setJobs(Array.isArray(j) ? j : [])
    } catch (_) {}
  }

  useEffect(() => {
    loadJobs()
  }, [])

  // KPI Calculations
  const lastPollTime = sessions.length ? new Date(sessions[0].poll_time).toLocaleTimeString() : '—'
  const latestSnapshot = (() => {
    for (const s of sessions) {
      if (s.onu_count != null) {
        return { total: s.onu_count, online: s.online_count ?? '—', offline: s.offline_count ?? '—' }
      }
    }
    return { total: '—', online: '—', offline: '—' }
  })()

  // Save Profile
  const handleSaveProfile = async () => {
    if (!form.ip || !form.username) {
      setProfileMsg({ text: 'IP address and Username are required.', ok: false })
      return
    }
    if (!editId && !form.password) {
      setProfileMsg({ text: 'Password is required for new profiles.', ok: false })
      return
    }
    const payload = { ...form, id: editId }
    if (!payload.enable_pass && payload.password) payload.enable_pass = payload.password

    try {
      const res = await apiPost(editId ? '/api/olt/profiles/update' : '/api/olt/profiles/add', payload)
      if (res.success) {
        setProfileMsg({ text: editId ? 'OLT profile updated.' : 'OLT profile created.', ok: true })
        setEditId('')
        setForm(emptyForm)
        loadData()
      } else {
        setProfileMsg({ text: res.error || 'Operation failed', ok: false })
      }
    } catch (e: any) {
      setProfileMsg({ text: e.message || 'Request failed', ok: false })
    }
  }

  const handleStartEditProfile = (p: any) => {
    setEditId(String(p.id))
    setForm({
      name: p.name || '',
      ip: p.ip || '',
      olt_model: p.olt_model || 'V1600G1',
      conn_type: p.conn_type || 'auto',
      ssh_port: p.ssh_port || '22',
      telnet_port: p.telnet_port || '23',
      username: p.username || '',
      password: '',
      enable_pass: '',
      uplink_ports: p.uplink_ports || 'gigabitethernet 0/10'
    })
    setConfigOpen(true)
  }

  const handleDeleteProfile = async (p: any) => {
    if (!confirm(`Delete OLT profile "${p.name || p.ip}"?`)) return
    try {
      await apiPost('/api/olt/profiles/delete', { id: p.id })
      loadData()
    } catch (e: any) {
      alert('Delete failed: ' + e.message)
    }
  }

  // Poll ONU
  const handlePollOnu = async (p: any) => {
    setPollingId(p.id)
    setActionMsg({ text: `Connecting to ${p.name || p.ip}... Fetching ONU list & optical telemetry`, ok: true, loading: true })
    try {
      const res = await apiPost('/api/olt/poll_onu', { id: p.id })
      setPollingId(null)
      if (res.success) {
        setActionMsg({
          text: `Success: ${res.onu_count} ONUs (${res.online_count} online) fetched via ${(res.method || '?').toUpperCase()} in ${res.duration}s`,
          ok: true,
          loading: false
        })
        setOnuModal({
          open: true,
          ip: p.ip,
          name: p.name || p.ip,
          onus: res.onus || [],
          pollTime: res.poll_time || null
        })
        loadData()
      } else {
        setActionMsg({ text: `ONU fetch failed: ${res.error || 'Unknown error'}`, ok: false, loading: false })
      }
    } catch (e: any) {
      setPollingId(null)
      setActionMsg({ text: `Request failed: ${e.message}`, ok: false, loading: false })
    }
  }

  // View ONUs from Database
  const handleViewOnus = async (p: any) => {
    setOnuModal({ open: true, ip: p.ip, name: p.name || p.ip, onus: [], pollTime: null })
    try {
      const res = await apiFetch(`/api/olt/onus?ip=${encodeURIComponent(p.ip)}`)
      const list = Array.isArray(res) ? res : []
      const pollTime = list.length > 0 ? list[0].poll_time : null
      setOnuModal({ open: true, ip: p.ip, name: p.name || p.ip, onus: list, pollTime })
    } catch (_) {}
  }


  // Poll Uplink
  const handlePollUplink = async (p: any) => {
    setActionMsg({ text: `Fetching uplink statistics from ${p.name || p.ip}...`, ok: true, loading: true })
    try {
      const savedPorts = (p.uplink_ports || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const res = await apiPost('/api/olt/poll_uplink', { id: p.id, interfaces: savedPorts })
      if (res.success !== false) {
        setActionMsg({ text: 'Uplink statistics polled successfully. See Uplink Traffic tab.', ok: true, loading: false })
      } else {
        setActionMsg({ text: `Uplink poll failed: ${res.error || 'Failed'}`, ok: false, loading: false })
      }
    } catch (e: any) {
      setActionMsg({ text: `Request failed: ${e.message}`, ok: false, loading: false })
    }
  }

  // Schedule Jobs
  const handleStartJobEdit = (j: any) => {
    setEditJobId(String(j.id))
    setJob({
      profile_id: String(j.profile_id),
      poll_type: j.poll_type || 'onu',
      run_mode: j.run_mode || 'repeat',
      start_at: j.start_at ? j.start_at.slice(0, 16) : '',
      interval_min: String(j.interval_min || 60),
      selected_ports: j.selected_ports || ''
    })
  }

  const handleSaveJob = async () => {
    if (!job.profile_id) {
      setJobMsg({ text: 'Select an OLT profile first.', ok: false })
      return
    }
    const body: any = { ...job }
    if (!body.start_at) {
      const dt = new Date(Date.now() + 5 * 60000)
      body.start_at = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    }
    try {
      const url = editJobId ? '/api/olt/jobs/update' : '/api/olt/jobs/add'
      const payload = editJobId ? { ...body, id: editJobId } : body
      const res = await apiPost(url, payload)
      if (res.success) {
        setJobMsg({ text: editJobId ? 'Automatic poll schedule updated.' : 'Automatic poll saved.', ok: true })
        setEditJobId('')
        setJob(emptyJob)
        loadJobs()
      } else {
        setJobMsg({ text: res.error || 'Failed to save job', ok: false })
      }
    } catch (e: any) {
      setJobMsg({ text: e.message || 'Request failed', ok: false })
    }
  }

  const handleToggleJob = async (j: any) => {
    try {
      await apiPost('/api/olt/jobs/toggle', { id: j.id })
      loadJobs()
    } catch (_) {}
  }

  const handleDeleteJob = async (j: any) => {
    if (!confirm('Delete this automated polling schedule?')) return
    try {
      await apiPost('/api/olt/jobs/delete', { id: j.id })
      loadJobs()
    } catch (_) {}
  }

  const jobOltName = (j: any) => {
    const p = profiles.find(x => String(x.id) === String(j.profile_id))
    return p ? (p.name || p.ip) : `Profile #${j.profile_id}`
  }

  const pagedSessions = sessions.slice(sessionPage * sessionPageSize, (sessionPage + 1) * sessionPageSize)

  return (
    <div className="space-y-6">
      {/* ── 5 KPI CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">OLT Profiles</div>
          <div className="text-xl font-bold font-mono text-cyan-400">{profiles.length}</div>
          <div className="text-[10px] text-slate-500">configured</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Last Poll</div>
          <div className="text-base font-bold font-mono text-slate-200 truncate">{lastPollTime}</div>
          <div className="text-[10px] text-slate-500">most recent session</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Total ONUs</div>
          <div className="text-xl font-bold font-mono text-amber-400">{latestSnapshot.total}</div>
          <div className="text-[10px] text-slate-500">last snapshot</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Online ONUs</div>
          <div className="text-xl font-bold font-mono text-emerald-400">{latestSnapshot.online}</div>
          <div className="text-[10px] text-slate-500">working state</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Offline ONUs</div>
          <div className="text-xl font-bold font-mono text-rose-400">{latestSnapshot.offline}</div>
          <div className="text-[10px] text-slate-500">unreachable</div>
        </div>
      </div>

      {/* ── PROFILE CONFIGURATION FORM ──────────────────────────────── */}
      {isAdmin && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <div
            onClick={() => setConfigOpen(!configOpen)}
            className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors"
          >
            <div>
              <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                OLT Connection Profiles
              </h3>
              <p className="text-xs font-mono text-slate-400">SSH / Telnet credentials &amp; target OLT parameters</p>
            </div>
            <button className="p-1 rounded-lg text-slate-400">
              {configOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {configOpen && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">OLT Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. BSNL_OLAPATI"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">IP Address</label>
                  <input
                    type="text"
                    value={form.ip}
                    onChange={e => setForm({ ...form, ip: e.target.value })}
                    placeholder="103.x.x.x"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">OLT Model</label>
                  <select
                    value={form.olt_model}
                    onChange={e => setForm({ ...form, olt_model: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="V1600G1">V1600G1</option>
                    <option value="V1600G1B">V1600G1B</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Connection Protocol</label>
                  <select
                    value={form.conn_type}
                    onChange={e => setForm({ ...form, conn_type: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="auto">Auto (SSH then Telnet)</option>
                    <option value="ssh">SSH only</option>
                    <option value="telnet">Telnet only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="admin"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="login password"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Enable Password</label>
                  <input
                    type="password"
                    value={form.enable_pass}
                    onChange={e => setForm({ ...form, enable_pass: e.target.value })}
                    placeholder="same as password"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Uplink Port(s)</label>
                  <input
                    type="text"
                    value={form.uplink_ports}
                    onChange={e => setForm({ ...form, uplink_ports: e.target.value })}
                    placeholder="gigabitethernet 0/10"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <StatusMessage msg={profileMsg.text} ok={profileMsg.ok} />

              <div className="flex gap-2">
                <button
                  onClick={handleSaveProfile}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all shadow-md shadow-cyan-500/20"
                >
                  {editId ? 'Update OLT Profile' : '+ Add OLT Profile'}
                </button>
                {editId && (
                  <button
                    onClick={() => {
                      setEditId('')
                      setForm(emptyForm)
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REGISTERED OLTS TABLE ───────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Registered OLTs</h3>
            <p className="text-xs font-mono text-slate-400">Perform manual ONU or uplink telemetry polls</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{profiles.length} profiles</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Protocol</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Uplink Ports</th>
                <th className="py-3 px-4">Last Poll</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!profiles.length ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">No OLT profiles configured yet.</td>
                </tr>
              ) : (
                profiles.map(p => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-sans font-bold text-slate-100">{p.name || p.ip}</td>
                    <td className="py-3 px-4 text-cyan-400">{p.ip}</td>
                    <td className="py-3 px-4">
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[10px] uppercase font-bold">
                        {p.conn_type || 'auto'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{p.olt_model || 'V1600G1'}</td>
                    <td className="py-3 px-4 text-slate-400">{p.username || '-'}</td>
                    <td className="py-3 px-4 text-slate-400">{p.uplink_ports || 'gigabitethernet 0/10'}</td>
                    <td className="py-3 px-4 text-slate-300">
                      {p.last_poll ? new Date(p.last_poll).toLocaleTimeString() : 'Never'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        p.last_status === 'ok'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : p.last_status === 'never'
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {(p.last_status || 'never').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handlePollOnu(p)}
                          disabled={pollingId === p.id}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 transition-all flex items-center gap-1"
                        >
                          {pollingId === p.id ? <RotateCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          <span>{pollingId === p.id ? 'Polling...' : 'Get ONU Info'}</span>
                        </button>
                        <button
                          onClick={() => handleViewOnus(p)}
                          className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        >
                          View ONUs
                        </button>
                        <button
                          onClick={() => handlePollUplink(p)}
                          disabled={pollingId === p.id}
                          className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        >
                          Uplink
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleStartEditProfile(p)}
                              className="p-1 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProfile(p)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-800">
          <StatusMessage msg={actionMsg.text} ok={actionMsg.ok} loading={actionMsg.loading} />
        </div>
      </div>

      {/* ── AUTOMATIC POLL SCHEDULER ─────────────────────────────────── */}
      {isAdmin && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                Automatic Poll Scheduler
              </h3>
              <p className="text-xs font-mono text-slate-400">Scheduled background ONU and uplink collectors</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Target OLT</label>
              <select
                value={job.profile_id}
                onChange={e => setJob({ ...job, profile_id: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="">- select OLT -</option>
                {profiles.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.name || p.ip}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Poll Type</label>
              <select
                value={job.poll_type}
                onChange={e => setJob({ ...job, poll_type: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="onu">ONU List</option>
                <option value="uplink">Uplink Traffic</option>
                <option value="full">Full Poll</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Schedule Mode</label>
              <select
                value={job.run_mode}
                onChange={e => setJob({ ...job, run_mode: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="repeat">Repeated</option>
                <option value="once">One Time</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Interval (Min)</label>
              <select
                value={job.interval_min}
                onChange={e => setJob({ ...job, interval_min: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                {[5, 10, 15, 30, 60, 120, 240].map(m => (
                  <option key={m} value={String(m)}>{m} min</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveJob}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all shadow-md shadow-cyan-500/20"
              >
                {editJobId ? 'Update Schedule' : '+ Save Schedule'}
              </button>
              {editJobId && (
                <button
                  onClick={() => {
                    setEditJobId('')
                    setJob(emptyJob)
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <StatusMessage msg={jobMsg.text} ok={jobMsg.ok} />

          {/* Jobs Table */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Target OLT</th>
                  <th className="py-2.5 px-3">Poll Type</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Interval</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Last Run</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {!jobs.length ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">No scheduled polls configured.</td>
                  </tr>
                ) : (
                  jobs.map(j => (
                    <tr key={j.id} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-200 font-sans font-bold">{jobOltName(j)}</td>
                      <td className="py-2 px-3 text-cyan-400 uppercase">{j.poll_type}</td>
                      <td className="py-2 px-3 text-slate-400">{j.run_mode === 'once' ? 'One Time' : 'Repeated'}</td>
                      <td className="py-2 px-3 text-slate-300">{j.interval_min ? `${j.interval_min} min` : '-'}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          j.enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {j.enabled ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400">{j.last_run ? new Date(j.last_run).toLocaleTimeString() : 'Never'}</td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleStartJobEdit(j)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] border border-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleJob(j)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700"
                          >
                            {j.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            onClick={() => handleDeleteJob(j)}
                            className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] border border-rose-500/30"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── POLL SESSIONS HISTORY ────────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100">Poll Sessions History</h3>
            <p className="text-xs font-mono text-slate-400">Execution log of manual and automated poll runs</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Page {sessionPage + 1}</span>
            <button
              onClick={() => setSessionPage(prev => Math.max(0, prev - 1))}
              disabled={sessionPage === 0}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSessionPage(prev => prev + 1)}
              disabled={(sessionPage + 1) * sessionPageSize >= sessions.length}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">Poll Time</th>
                <th className="py-3 px-4">Target OLT</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Total ONUs</th>
                <th className="py-3 px-4">Online</th>
                <th className="py-3 px-4">Offline</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!pagedSessions.length ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">No poll sessions recorded.</td>
                </tr>
              ) : (
                pagedSessions.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 text-slate-300">{new Date(s.poll_time).toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-cyan-400 font-bold">{s.olt_name || s.olt_ip || '—'}</td>
                    <td className="py-2.5 px-4 text-slate-400">{s.duration != null ? `${s.duration}s` : '—'}</td>
                    <td className="py-2.5 px-4 text-slate-200">{s.onu_count ?? '—'}</td>
                    <td className="py-2.5 px-4 text-emerald-400">{s.online_count ?? '—'}</td>
                    <td className="py-2.5 px-4 text-rose-400">{s.offline_count ?? '—'}</td>
                    <td className="py-2.5 px-4 text-amber-400 uppercase">{s.method || '—'}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        s.success === false
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {s.success === false ? 'FAILED' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Onu Modal */}
      {onuModal.open && (
        <OnuModal
          name={onuModal.name}
          ip={onuModal.ip}
          onus={onuModal.onus}
          pollTime={onuModal.pollTime}
          onClose={() => setOnuModal({ ...onuModal, open: false })}
        />
      )}
    </div>
  )
}
