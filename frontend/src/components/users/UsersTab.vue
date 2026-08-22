<template>
  <main>
    <div class="crow">
      <!-- Change Password -->
      <div class="panel">
        <div class="ph"><div class="pt">Change My Password</div><div class="pb2">{{ auth.username }}</div></div>
        <div class="pb" style="display:grid;gap:10px">
          <div><label class="flabel">CURRENT PASSWORD</label><input v-model="pw.old" type="password" class="finp" autocomplete="current-password" /></div>
          <div><label class="flabel">NEW PASSWORD</label><input v-model="pw.new1" type="password" class="finp" autocomplete="new-password" /></div>
          <div><label class="flabel">CONFIRM NEW PASSWORD</label><input v-model="pw.new2" type="password" class="finp" autocomplete="new-password" /></div>
          <StatusMessage :msg="pwMsg" :ok="pwOk" />
          <button class="rb" style="padding:9px;width:fit-content" @click="changePassword">Update Password</button>
        </div>
      </div>

      <!-- Backup / Restore -->
      <div class="panel">
        <div class="ph"><div class="pt">Configuration Backup &amp; Restore</div><div class="pb2">Admin only</div></div>
        <div class="pb">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="background:rgba(0,229,255,0.04);border:1px solid var(--border);border-radius:6px;padding:14px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:var(--accent)">BACKUP</div>
                <span style="font-size:9px;font-weight:700;letter-spacing:1px;padding:2px 6px;border-radius:3px;background:rgba(57,255,20,0.12);color:var(--accent3);border:1px solid rgba(57,255,20,0.3)">&#128274; ENCRYPTED</span>
              </div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:10px;font-family:'Share Tech Mono',monospace">
                Downloads a JSON backup of settings, OLT profiles, alert rules, ping targets, and user accounts.
                Sensitive passwords are AES-256 encrypted. Historical data is NOT included.
              </div>
              <a href="/api/backup/download" class="rb" style="width:100%;padding:9px;font-size:12px;display:block;text-align:center;text-decoration:none">Download Backup</a>
            </div>
            <div style="background:rgba(255,107,53,0.04);border:1px solid var(--border);border-radius:6px;padding:14px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:var(--accent2)">RESTORE</div>
                <span style="font-size:9px;font-weight:700;letter-spacing:1px;padding:2px 6px;border-radius:3px;background:rgba(255,107,53,0.12);color:var(--accent2);border:1px solid rgba(255,107,53,0.3)">&#9888; SAME INSTANCE ONLY</span>
              </div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:10px;font-family:'Share Tech Mono',monospace">
                Select a backup JSON file to restore. Configuration settings will be replaced, historical logs remain untouched.
                Encrypted backups can only be restored on the same instance.
              </div>
              <input type="file" ref="restoreInput" accept=".json" style="display:none" @change="restoreBackup" />
              <button class="rb" style="width:100%;padding:9px;font-size:12px;border-color:var(--accent2);color:var(--accent2)" @click="$refs.restoreInput.click()">Select Backup File</button>
            </div>
          </div>
          <StatusMessage :msg="backupMsg" :ok="backupOk" pre />
        </div>
      </div>
    </div>

    <!-- Add User -->
    <div v-if="auth.isAdmin" class="panel">
      <div class="ph"><div class="pt">Add User</div><div class="pb2">Role-based access with per-tab permissions</div></div>
      <div class="pb" style="display:grid;gap:10px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
          <div><label class="flabel">USERNAME</label><input v-model="nu.username" class="finp" placeholder="new_user" /></div>
          <div><label class="flabel">PASSWORD</label><input v-model="nu.password" type="password" class="finp" placeholder="min 6 chars" /></div>
          <div><label class="flabel">EMAIL</label><input v-model="nu.email" class="finp" placeholder="user@domain.com" /></div>
          <div>
            <label class="flabel">ROLE</label>
            <select v-model="nu.role" class="finp" @change="onRoleChange">
              <option value="viewer">Viewer (read-only)</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        </div>
        <div v-if="nu.role !== 'admin'">
          <label class="flabel">VISIBLE TABS</label>
          <div class="tab-checks">
            <label v-for="t in ASSIGNABLE_TABS" :key="t.id" class="chk"><input type="checkbox" :value="t.id" v-model="nu.visible_tabs" /> {{ t.label }}</label>
          </div>
        </div>
        <div v-if="targets.olts.length && nu.role !== 'admin'">
          <label class="flabel">ASSIGNED OLTS (empty = all)</label>
          <div class="tab-checks">
            <label v-for="o in targets.olts" :key="o" class="chk"><input type="checkbox" :value="o" v-model="nu.assigned_olts" /> {{ o }}</label>
          </div>
        </div>
        <div v-if="targets.ping_targets.length && nu.role !== 'admin'">
          <label class="flabel">ASSIGNED PING TARGETS (empty = all)</label>
          <div class="tab-checks">
            <label v-for="t in targets.ping_targets" :key="t" class="chk"><input type="checkbox" :value="t" v-model="nu.assigned_ping" /> {{ t }}</label>
          </div>
        </div>
        <StatusMessage :msg="nuMsg" :ok="nuOk" />
        <button class="rb" style="padding:9px;width:fit-content" @click="addUser">+ Create User</button>
      </div>
    </div>

    <!-- Users Table -->
    <div v-if="auth.isAdmin" class="panel">
      <div class="ph"><div class="pt">All Users</div><div class="pb2">{{ users.length }}</div></div>
      <div class="tw">
        <table>
          <thead><tr><th>#</th><th>Username</th><th>Role</th><th>Email</th><th>Assigned Sites</th><th>Visible Tabs</th><th>Created</th><th>Last Login</th><th>Action</th></tr></thead>
          <tbody>
            <tr v-if="!users.length"><td colspan="9"><div class="empty">No users.</div></td></tr>
            <tr v-for="(u, i) in users" :key="u.username">
              <td>{{ i + 1 }}</td>
              <td>{{ u.username }}</td>
              <td><span class="b" :class="u.role === 'admin' ? 'bp' : 'bc'">{{ roleLabel(u.role) }}</span></td>
              <td style="font-size:11px">{{ u.email || '-' }}</td>
              <td style="font-size:10px;color:var(--muted)">{{ assignedLabel(u) }}</td>
              <td style="font-size:10px;color:var(--muted)">{{ (u.visible_tabs || []).join(', ') || 'default' }}</td>
              <td style="font-size:10px">{{ u.created_at ? new Date(u.created_at).toLocaleDateString() : '-' }}</td>
              <td style="font-size:10px">{{ u.last_login ? new Date(u.last_login).toLocaleString() : 'Never' }}</td>
              <td style="white-space:nowrap">
                <button class="ubtn" style="padding:3px 8px;font-size:10px;margin-right:3px" @click="openEdit(u)">Edit</button>
                <button v-if="u.username !== auth.username" class="lbtn" style="padding:3px 8px;font-size:10px" @click="deleteUser(u)">Del</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit User Modal -->
    <div v-if="editUser" class="modal-overlay show" @click.self="editUser = null">
      <div class="modal-panel" style="max-width:560px">
        <h3>Edit User: {{ editUser.username }}</h3>
        <div style="display:grid;gap:10px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label class="flabel">ROLE</label>
              <select v-model="editUser.role" class="finp">
                <option value="viewer">Viewer (read-only)</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div><label class="flabel">EMAIL</label><input v-model="editUser.email" class="finp" /></div>
          </div>
          <div><label class="flabel">NEW PASSWORD (leave blank to keep)</label><input v-model="editUser.new_password" type="password" class="finp" /></div>
          <div v-if="editUser.role !== 'admin'">
            <label class="flabel">VISIBLE TABS</label>
            <div class="tab-checks">
              <label v-for="t in ASSIGNABLE_TABS" :key="t.id" class="chk">
                <input type="checkbox" :value="t.id" v-model="editUser.visible_tabs_arr" /> {{ t.label }}
              </label>
            </div>
          </div>
          <StatusMessage :msg="euMsg" :ok="euOk" />
          <div style="display:flex;justify-content:flex-end;gap:10px">
            <button class="rbtn" @click="editUser = null">Cancel</button>
            <button class="rb" @click="saveEdit">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { apiFetch, apiPost } from '../../api'
import { useAuthStore, roleLabel, getDefaultTabsForRole } from '../../stores/auth'
import { usePolling } from '../../composables/usePolling'
import StatusMessage from '../shared/StatusMessage.vue'

const auth = useAuthStore()
const ASSIGNABLE_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'syslog', label: 'Syslog' },
  { id: 'snmp', label: 'SNMP Trap' },
  { id: 'tftp', label: 'TFTP Backups' },
  { id: 'ping', label: 'Ping Monitor' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'olt', label: 'OLT Connect' },
  { id: 'uplink', label: 'Uplink Traffic' },
  { id: 'ont', label: 'ONT' }
]

const pw = ref({ old: '', new1: '', new2: '' })
const nu = ref({ username: '', password: '', email: '', role: 'viewer', visible_tabs: [...getDefaultTabsForRole('viewer')], assigned_olts: [], assigned_ping: [] })
const users = ref([])
const targets = ref({ olts: [], ping_targets: [] })
const editUser = ref(null)
const restoreInput = ref(null)

const pwMsg = ref(''); const pwOk = ref(false)
const nuMsg = ref(''); const nuOk = ref(false)
const euMsg = ref(''); const euOk = ref(false)
const backupMsg = ref(''); const backupOk = ref(false)

function assignedLabel(u) {
  const parts = []
  if (u.assigned_olts && u.assigned_olts.length) parts.push('OLTs: ' + u.assigned_olts.join(', '))
  if (u.assigned_ping_targets && u.assigned_ping_targets.length) parts.push('Ping: ' + u.assigned_ping_targets.join(', '))
  return parts.length ? parts.join(' | ') : 'All'
}

async function load() {
  try {
    const us = await apiFetch('/api/auth/users')
    users.value = Array.isArray(us) ? us : []
  } catch (_) {}
}
usePolling(load, 20000)

async function loadTargets() {
  try {
    const d = await apiFetch('/api/auth/available_targets')
    targets.value = { olts: d.olts || [], ping_targets: d.ping_targets || [] }
  } catch (_) {}
}
loadTargets()

function onRoleChange() {
  nu.value.visible_tabs = [...getDefaultTabsForRole(nu.value.role)]
}

async function changePassword() {
  if (!pw.value.old || !pw.value.new1) { flash(pwMsg, pwOk, 'Enter current and new password.', false); return }
  if (pw.value.new1 !== pw.value.new2) { flash(pwMsg, pwOk, 'New passwords do not match.', false); return }
  if (pw.value.new1.length < 6) { flash(pwMsg, pwOk, 'Password must be at least 6 characters.', false); return }
  try {
    const r = await apiPost('/api/auth/change_password', { old_password: pw.value.old, new_password: pw.value.new1 })
    if (r.success) { flash('Password updated.', true, pwMsg, pwOk); pw.value = { old: '', new1: '', new2: '' } }
    else flash(r.error || 'Failed.', false, pwMsg, pwOk)
  } catch (e) { flash(e.message, false, pwMsg, pwOk) }
}

async function addUser() {
  const u = nu.value
  if (!u.username.trim() || !u.password) { flash(nuMsg, nuOk, 'Username and password are required.', false); return }
  if (u.password.length < 6) { flash(nuMsg, nuOk, 'Password must be at least 6 characters.', false); return }
  try {
    const r = await apiPost('/api/auth/users/add', {
      username: u.username.trim(), password: u.password, email: u.email.trim(),
      role: u.role, visible_tabs: u.role === 'admin' ? [] : u.visible_tabs,
      assigned_olts: u.assigned_olts, assigned_ping_targets: u.assigned_ping
    })
    if (r.success) {
      flash('User created: ' + u.username, true, nuMsg, nuOk)
      nu.value = { username: '', password: '', email: '', role: 'viewer', visible_tabs: [...getDefaultTabsForRole('viewer')], assigned_olts: [], assigned_ping: [] }
      load()
    } else flash(r.error || 'Failed.', false, nuMsg, nuOk)
  } catch (e) { flash(e.message, false, nuMsg, nuOk) }
}

function openEdit(u) {
  editUser.value = {
    ...u,
    new_password: '',
    visible_tabs_arr: Array.isArray(u.visible_tabs) ? [...u.visible_tabs] : []
  }
  euMsg.value = ''
}

async function saveEdit() {
  const e = editUser.value
  try {
    const r = await apiPost('/api/auth/users/edit', {
      username: e.username,
      role: e.role,
      email: (e.email || '').trim(),
      new_password: (e.new_password || '').trim() || undefined,
      visible_tabs: e.role === 'admin' ? [] : e.visible_tabs_arr
    })
    if (r.success) { editUser.value = null; load() }
    else flash(r.error || 'Failed.', false, euMsg, euOk)
  } catch (err) { flash(err.message, false, euMsg, euOk) }
}

async function deleteUser(u) {
  if (!confirm('Delete user "' + u.username + '"?')) return
  try { await apiPost('/api/auth/users/delete', { username: u.username }); load() } catch (e) { alert(e.message) }
}

async function restoreBackup(ev) {
  const file = ev.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    let backup
    try { backup = JSON.parse(reader.result) } catch (_) { flash('Invalid backup file.', false, backupMsg, backupOk); return }
    if (!backup.version) { flash('Invalid backup file.', false, backupMsg, backupOk); return }
    if (!confirm('Restore this backup and replace the current PostgreSQL data?')) { ev.target.value = ''; return }
    flash('Restoring... please wait.', true, backupMsg, backupOk)
    try {
      const result = await apiPost('/api/backup/restore', backup)
      const restored = result.restored || {}
      const summary = Object.keys(restored).sort().map(t => `${t}: ${restored[t]} rows restored`).join('\n')
      flash('\u2705 Restore complete!\n' + summary, true, backupMsg, backupOk)
    } catch (err) {
      let msg = err.message || 'Unknown error'
      if (msg.includes('ecrypt')) msg = '\u26A0\uFE0F Decryption error: This backup was created on a different instance or with a different PostgreSQL password.\n\nDetail: ' + msg
      else msg = '\u274C Restore error: ' + msg
      flash(msg, false, backupMsg, backupOk)
    }
    ev.target.value = ''
  }
  reader.readAsText(file)
}

function flash(m, ok, setMsg, setOk) { setMsg.value = m; setOk.value = ok }
</script>

<style scoped>
.tab-checks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
.chk { font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
.bx { background: rgba(92,125,146,0.15); color: var(--muted); border: 1px solid var(--muted); }
.bp { background: rgba(255,45,85,0.12); color: var(--danger); border: 1px solid var(--danger); }
</style>
