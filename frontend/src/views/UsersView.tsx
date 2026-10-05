import React, { useState, useEffect, useRef } from 'react'
import { Users, Plus, KeyRound, Shield, Download, Upload, Trash2, Edit2, CheckSquare } from 'lucide-react'
import { apiFetch, apiPost } from '../api'
import { useAuth, ALL_TABS, roleLabel } from '../context/AuthContext'
import { StatusMessage } from '../components/shared/StatusMessage'

export const UsersView: React.FC = () => {
  const { isAdmin, username: currentUsername } = useAuth()

  const [users, setUsers] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [pingTargets, setPingTargets] = useState<any[]>([])

  // Add User Form
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'viewer',
    visible_tabs: ALL_TABS.map(t => t.id),
    assigned_olts: [] as string[],
    assigned_ping: [] as string[]
  })

  // Change Pass Form
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' })

  // Edit User Modal
  const [editModal, setEditModal] = useState<any | null>(null)

  // Status messages
  const [addMsg, setAddMsg] = useState({ text: '', ok: false })
  const [passMsg, setPassMsg] = useState({ text: '', ok: false })
  const [editMsg, setEditMsg] = useState({ text: '', ok: false })
  const [bakMsg, setBakMsg] = useState({ text: '', ok: false })

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    try {
      const u = await apiFetch('/api/auth/users')
      setUsers(Array.isArray(u) ? u : [])
    } catch (_) {}
    try {
      const p = await apiFetch('/api/olt/profiles')
      setProfiles(Array.isArray(p) ? p : [])
    } catch (_) {}
    try {
      const t = await apiFetch('/api/ping/targets')
      setPingTargets(Array.isArray(t) ? t : [])
    } catch (_) {}
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAddUser = async () => {
    if (!newUser.username.trim() || !newUser.password) {
      setAddMsg({ text: 'Username and password are required.', ok: false })
      return
    }
    try {
      const r = await apiPost('/api/auth/users/add', newUser)
      if (r.success !== false) {
        setAddMsg({ text: 'User account created.', ok: true })
        setNewUser({
          username: '',
          password: '',
          role: 'viewer',
          visible_tabs: ALL_TABS.map(t => t.id),
          assigned_olts: [],
          assigned_ping: []
        })
        loadData()
      } else {
        setAddMsg({ text: r.error || 'Failed', ok: false })
      }
    } catch (e: any) {
      setAddMsg({ text: e.message, ok: false })
    }
  }

  const handleDeleteUser = async (u: any) => {
    if (u.username === currentUsername) {
      alert('You cannot delete your own account.')
      return
    }
    if (!confirm(`Delete user "${u.username}"?`)) return
    try {
      await apiPost('/api/auth/users/delete', { username: u.username })
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleSaveEdit = async () => {
    try {
      const r = await apiPost('/api/auth/users/edit', editModal)
      if (r.success !== false) {
        setEditModal(null)
        loadData()
      } else {
        setEditMsg({ text: r.error || 'Failed', ok: false })
      }
    } catch (e: any) {
      setEditMsg({ text: e.message, ok: false })
    }
  }

  const handleChangePassword = async () => {
    if (!passForm.next || passForm.next !== passForm.confirm) {
      setPassMsg({ text: 'New passwords do not match.', ok: false })
      return
    }
    try {
      const r = await apiPost('/api/auth/change_password', {
        current_password: passForm.current,
        new_password: passForm.next
      })
      if (r.success) {
        setPassMsg({ text: 'Password updated successfully.', ok: true })
        setPassForm({ current: '', next: '', confirm: '' })
      } else {
        setPassMsg({ text: r.error || 'Failed', ok: false })
      }
    } catch (e: any) {
      setPassMsg({ text: e.message, ok: false })
    }
  }

  const handleDownloadBackup = () => {
    window.location.href = '/api/backup/download'
  }

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm(`Restore system configuration from ${file.name}? Current database settings will be overwritten.`)) return
    const formData = new FormData()
    formData.append('backup', file)
    setBakMsg({ text: 'Restoring backup...', ok: true })
    try {
      const r = await fetch('/api/backup/restore', { method: 'POST', body: formData, credentials: 'include' })
      const d = await r.json()
      if (d.success) {
        setBakMsg({ text: 'Restore complete. Reloading data...', ok: true })
        loadData()
      } else {
        setBakMsg({ text: d.error || 'Restore failed', ok: false })
      }
    } catch (err: any) {
      setBakMsg({ text: err.message, ok: false })
    }
  }

  const toggleTab = (arr: string[], id: string) => {
    return arr.includes(id) ? arr.filter(t => t !== id) : [...arr, id]
  }

  return (
    <div className="space-y-6">
      {/* ── USER ACCOUNTS TABLE ──────────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              User Accounts &amp; Access Permissions
            </h3>
            <p className="text-xs font-mono text-slate-400">Role-based privileges and per-user module visibility</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{users.length} accounts</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[10px] uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Visible Tabs</th>
                <th className="py-3 px-4">Assigned OLTs</th>
                <th className="py-3 px-4">Assigned Targets</th>
                <th className="py-3 px-4">Last Login</th>
                {isAdmin && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map(u => (
                <tr key={u.username} className="hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-sans font-bold text-slate-100 flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-mono text-cyan-400">
                      {u.username[0].toUpperCase()}
                    </div>
                    <span>{u.username}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      u.role === 'admin' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    }`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {u.role === 'admin' ? 'All Modules (Admin)' : (u.visible_tabs?.join(', ') || 'Default')}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{u.assigned_olts?.length ? u.assigned_olts.join(', ') : 'All OLTs'}</td>
                  <td className="py-3 px-4 text-slate-400">{u.assigned_ping?.length ? u.assigned_ping.join(', ') : 'All Sites'}</td>
                  <td className="py-3 px-4 text-slate-400">{u.last_login ? new Date(u.last_login).toLocaleTimeString() : 'Never'}</td>
                  {isAdmin && (
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setEditModal({ ...u, new_password: '' })}
                          className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {u.username !== currentUsername && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ADD USER & CHANGE PASSWORD GRID ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Add User */}
        {isAdmin && (
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Create Operator Account
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="operator_1"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Account Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="viewer">Viewer (Read-Only Restricted)</option>
                  <option value="admin">Administrator (Full Privileges)</option>
                </select>
              </div>

              {newUser.role !== 'admin' && (
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Allowed Modules</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ALL_TABS.map(t => (
                      <label key={t.id} className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newUser.visible_tabs.includes(t.id)}
                          onChange={() => setNewUser({ ...newUser, visible_tabs: toggleTab(newUser.visible_tabs, t.id) })}
                          className="rounded border-slate-700 text-cyan-500"
                        />
                        <span className="truncate">{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <StatusMessage msg={addMsg.text} ok={addMsg.ok} />

              <button
                onClick={handleAddUser}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all"
              >
                + Create User
              </button>
            </div>
          </div>
        )}

        {/* Change Password */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            Change Password
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Current Password</label>
              <input
                type="password"
                value={passForm.current}
                onChange={e => setPassForm({ ...passForm, current: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">New Password</label>
              <input
                type="password"
                value={passForm.next}
                onChange={e => setPassForm({ ...passForm, next: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={passForm.confirm}
                onChange={e => setPassForm({ ...passForm, confirm: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <StatusMessage msg={passMsg.text} ok={passMsg.ok} />

            <button
              onClick={handleChangePassword}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase tracking-wider transition-all"
            >
              Update Password
            </button>
          </div>
        </div>
      </div>

      {/* ── BACKUP & RESTORE PANEL ───────────────────────────────────── */}
      {isAdmin && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            System Encrypted Backup &amp; Disaster Recovery
          </h3>
          <p className="text-xs font-mono text-slate-400">
            Export all OLT credentials, alert rules, user accounts, and settings as an encrypted archive.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadBackup}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" /> Download System Backup
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" /> Restore Backup File
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleRestoreFile}
              className="hidden"
              accept=".snoc,.bak,.json,.enc"
            />
          </div>

          <StatusMessage msg={bakMsg.text} ok={bakMsg.ok} />
        </div>
      )}

      {/* Edit User Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100">Edit User: {editModal.username}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Reset Password (leave empty to keep)</label>
                <input
                  type="password"
                  value={editModal.new_password || ''}
                  onChange={e => setEditModal({ ...editModal, new_password: e.target.value })}
                  placeholder="New password..."
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Role</label>
                <select
                  value={editModal.role}
                  onChange={e => setEditModal({ ...editModal, role: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300"
                >
                  <option value="viewer">Viewer (Read-Only)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {editModal.role !== 'admin' && (
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Visible Modules</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ALL_TABS.map(t => (
                      <label key={t.id} className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editModal.visible_tabs?.includes(t.id)}
                          onChange={() =>
                            setEditModal({
                              ...editModal,
                              visible_tabs: toggleTab(editModal.visible_tabs || [], t.id)
                            })
                          }
                          className="rounded border-slate-700 text-cyan-500"
                        />
                        <span className="truncate">{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <StatusMessage msg={editMsg.text} ok={editMsg.ok} />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 uppercase"
              >
                Save User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
