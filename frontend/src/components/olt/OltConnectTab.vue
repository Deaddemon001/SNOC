<template>
  <main>
    <div class="srow" style="grid-template-columns:repeat(5,minmax(0,1fr))">
      <div class="sc g"><div class="sl">OLT Profiles</div><div class="sv">{{ profiles.length }}</div><div class="ss">configured</div></div>
      <div class="sc c"><div class="sl">Last Poll</div><div class="sv" style="font-size:14px;padding-top:6px">{{ lastPoll }}</div><div class="ss">most recent</div></div>
      <div class="sc o"><div class="sl">Total ONUs</div><div class="sv">{{ snapshot.total }}</div><div class="ss">last snapshot</div></div>
      <div class="sc r"><div class="sl">Online ONUs</div><div class="sv">{{ snapshot.online }}</div><div class="ss">last snapshot</div></div>
      <div class="sc r"><div class="sl">Offline ONUs</div><div class="sv">{{ snapshot.offline }}</div><div class="ss">last snapshot</div></div>
    </div>

    <div v-if="auth.isAdmin" class="panel">
      <div class="ph" style="cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center" @click="configOpen = !configOpen">
        <div>
          <div class="pt">OLT Connection Profiles</div>
          <div class="pb2">SSH/Telnet credentials per OLT</div>
        </div>
        <span style="color:var(--accent);font-size:14px;transition:transform 0.2s" :style="{ transform: configOpen ? 'rotate(180deg)' : 'none' }">&#9660;</span>
      </div>
      <div v-if="configOpen" class="pb" style="display:grid;gap:10px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
          <div><label class="flabel">OLT NAME</label><input v-model="form.name" class="finp" placeholder="e.g. BSNL_OLAPATI" /></div>
          <div><label class="flabel">IP ADDRESS</label><input v-model="form.ip" class="finp" placeholder="103.x.x.x" /></div>
          <div>
            <label class="flabel">OLT MODEL</label>
            <select v-model="form.olt_model" class="finp"><option value="V1600G1">V1600G1</option><option value="V1600G1B">V1600G1B</option></select>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px">
            <div>
              <label class="flabel">CONNECTION</label>
              <select v-model="form.conn_type" class="finp">
                <option value="auto">Auto (SSH then Telnet)</option>
                <option value="ssh">SSH only</option>
                <option value="telnet">Telnet only</option>
              </select>
            </div>
            <div><label class="flabel">SSH PORT</label><input v-model="form.ssh_port" class="finp" /></div>
            <div><label class="flabel">TELNET PORT</label><input v-model="form.telnet_port" class="finp" /></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
          <div><label class="flabel">USERNAME</label><input v-model="form.username" class="finp" placeholder="admin" /></div>
          <div><label class="flabel">PASSWORD</label><input v-model="form.password" type="password" class="finp" placeholder="login password" /></div>
          <div><label class="flabel">ENABLE PASSWORD</label><input v-model="form.enable_pass" type="password" class="finp" placeholder="same as password if same" /></div>
          <div><label class="flabel">UPLINK PORT(S)</label><input v-model="form.uplink_ports" class="finp" placeholder="gigabitethernet 0/10" /></div>
        </div>
        <StatusMessage :msg="profileMsg" :ok="profileOk" />
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="rb" style="padding:9px" @click="saveProfile">{{ editId ? 'Update OLT Profile' : '+ Add OLT Profile' }}</button>
          <button v-if="editId" class="ubtn" style="padding:9px" @click="cancelEdit">Cancel Edit</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="ph">
        <div class="pt">Registered OLTs</div>
        <div class="pb2">Use the action buttons to fetch ONU or uplink data separately</div>
      </div>
      <div class="tw">
        <table>
          <thead>
            <tr><th>Name</th><th>IP</th><th>Conn</th><th>Model</th><th>Username</th><th>Uplink Port(s)</th><th>Last Poll</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr v-if="!profiles.length"><td colspan="9"><div class="empty">No OLT profiles yet. Add one above.</div></td></tr>
            <tr v-for="p in profiles" :key="p.id">
              <td style="font-weight:700">{{ p.name || p.ip }}</td>
              <td style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--accent)">{{ p.ip }}</td>
              <td><span class="b bc" style="font-size:9px">{{ (p.conn_type || 'auto').toUpperCase() }}</span></td>
              <td><span class="b bo" style="font-size:9px">{{ (p.olt_model || 'V1600G1').toUpperCase() }}</span></td>
              <td class="mu">{{ p.username || '-' }}</td>
              <td style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--accent2)">{{ p.uplink_ports || 'gigabitethernet 0/10' }}</td>
              <td style="font-size:11px">{{ p.last_poll ? new Date(p.last_poll).toLocaleString() : 'Never' }}</td>
              <td :style="{ fontSize: '11px', fontWeight: 700, color: statusColor(p.last_status) }">{{ (p.last_status || 'never').toUpperCase() }}{{ pollingId === p.id ? ' \u2026' : '' }}</td>
              <td style="white-space:nowrap">
                <button class="rb" style="padding:4px 9px;font-size:10px;margin-right:4px" :disabled="pollingId === p.id" @click="pollOnu(p)">{{ pollingId === p.id ? 'Fetching' : 'Get ONU Info' }}</button>
                <button class="ubtn" style="padding:4px 9px;font-size:10px;margin-right:4px" @click="viewOnus(p)">View ONUs</button>
                <button class="ubtn" style="padding:4px 9px;font-size:10px;margin-right:4px" :disabled="pollingId === p.id" @click="pollUplink(p)">Uplink</button>
                <template v-if="auth.isAdmin">
                  <button class="ubtn" style="padding:4px 9px;font-size:10px;margin-right:4px" @click="startEdit(p)">Edit</button>
                  <button class="lbtn" style="padding:4px 8px;font-size:10px" @click="deleteProfile(p)">Del</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <StatusMessage :msg="actionMsg" :ok="actionOk" />
    </div>

    <div v-if="auth.isAdmin" class="panel">
      <div class="ph"><div class="pt">Automatic Poll Scheduler</div><div class="pb2">Repeated or one-time ONU/Uplink polls</div></div>
      <div class="pb" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <label class="flabel">OLT PROFILE</label>
          <select v-model="job.profile_id" class="finp" style="min-width:170px">
            <option value="">- select OLT -</option>
            <option v-for="p in profiles" :key="p.id" :value="String(p.id)">{{ p.name || p.ip }}</option>
          </select>
        </div>
        <div>
          <label class="flabel">POLL TYPE</label>
          <select v-model="job.poll_type" class="finp" @change="onJobTypeChange">
            <option value="onu">ONU List</option>
            <option value="uplink">Uplink Traffic</option>
            <option value="full">Full Poll</option>
          </select>
        </div>
        <div>
          <label class="flabel">SCHEDULE</label>
          <select v-model="job.run_mode" class="finp">
            <option value="repeat">Repeated</option>
            <option value="once">One Time</option>
          </select>
        </div>
        <div><label class="flabel">START AT</label><input v-model="job.start_at" type="datetime-local" class="finp" /></div>
        <div>
          <label class="flabel">INTERVAL (MIN)</label>
          <select v-model="job.interval_min" class="finp">
            <option v-for="m in [5, 10, 15, 30, 60, 120, 240]" :key="m" :value="String(m)">{{ m }} min</option>
          </select>
        </div>
        <div v-if="job.poll_type === 'uplink'">
          <label class="flabel">UPLINK PORT</label>
          <select v-model="job.selected_ports" class="finp"><option value="">Saved profile ports</option></select>
        </div>
        <button class="rb" style="padding:9px 16px" @click="saveJob">{{ editJobId ? 'Update Schedule' : '+ Save Schedule' }}</button>
        <button v-if="editJobId" class="ubtn" style="padding:9px 16px" @click="cancelJobEdit">Cancel Edit</button>
      </div>
      <StatusMessage :msg="jobMsg" :ok="jobOk" />
      <div class="tw">
        <table>
          <thead><tr><th>OLT</th><th>Poll Type</th><th>Mode</th><th>Start</th><th>Interval</th><th>Enabled</th><th>Last Run</th><th v-if="auth.isAdmin">Actions</th></tr></thead>
          <tbody>
            <tr v-if="!jobs.length"><td :colspan="auth.isAdmin ? 8 : 7"><div class="empty">No automatic polls configured.</div></td></tr>
            <tr v-for="j in jobs" :key="j.id" :style="editJobId === String(j.id) ? { background: 'rgba(0,229,255,0.06)' } : {}">
              <td>{{ jobOltName(j) }}</td>
              <td><span class="b bc">{{ j.poll_type }}</span></td>
              <td>{{ j.run_mode === 'once' ? 'One Time' : 'Repeated' }}</td>
              <td style="font-size:11px">{{ j.start_at ? new Date(j.start_at).toLocaleString() : '-' }}</td>
              <td>{{ j.interval_min ? j.interval_min + ' min' : '-' }}</td>
              <td><span class="b" :class="j.enabled ? 'bg' : 'bx'">{{ j.enabled ? 'ACTIVE' : 'PAUSED' }}</span></td>
              <td style="font-size:11px">{{ j.last_run ? new Date(j.last_run).toLocaleString() : 'Never' }}</td>
              <td v-if="auth.isAdmin" style="white-space:nowrap">
                <button class="ubtn" style="padding:2px 8px;font-size:10px;margin-right:4px" @click="startJobEdit(j)">Edit</button>
                <button class="ubtn" style="padding:2px 8px;font-size:10px;margin-right:4px" @click="toggleJob(j)">{{ j.enabled ? 'Pause' : 'Resume' }}</button>
                <button class="lbtn" style="padding:2px 8px;font-size:10px" @click="deleteJob(j)">Del</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><div class="pt">Poll History</div><div class="pb2">{{ sessions.length }} sessions</div></div>
      <div class="tw">
        <table>
          <thead><tr><th>Time</th><th>OLT</th><th>Duration</th><th>Total ONUs</th><th>Online</th><th>Offline</th><th>Method</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-if="!pagedSessions.length"><td colspan="8"><div class="empty">No polls yet.</div></td></tr>
            <tr v-for="(s, i) in pagedSessions" :key="i">
              <td style="font-size:11px">{{ s.poll_time ? new Date(s.poll_time).toLocaleString() : '-' }}</td>
              <td><span class="b" :class="oltBadgeClass(s.olt_name || s.olt_ip)">{{ s.olt_name || s.olt_ip || '?' }}</span></td>
              <td>{{ s.duration != null ? s.duration + 's' : '-' }}</td>
              <td>{{ s.onu_count ?? '-' }}</td>
              <td style="color:var(--accent3)">{{ s.online_count ?? '-' }}</td>
              <td style="color:var(--danger)">{{ s.offline_count ?? '-' }}</td>
              <td><span class="b bo">{{ (s.method || '-').toUpperCase() }}</span></td>
              <td><span class="b" :class="s.success === false ? 'br' : 'bg'">{{ s.success === false ? 'FAILED' : 'OK' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--border);align-items:center">
        <button class="ubtn" style="padding:5px 12px;font-size:11px" :disabled="sessionPage === 0" @click="sessionPage--">&larr; Prev</button>
        <div class="pb2">Page {{ sessionPage + 1 }}</div>
        <button class="ubtn" style="padding:5px 12px;font-size:11px" :disabled="(sessionPage + 1) * sessionPageSize >= sessions.length" @click="sessionPage++">Next &rarr;</button>
      </div>
    </div>

    <OnuModal v-if="onuModalOpen" :ip="onuModalIp" :name="onuModalName" :onus="onuModalOnus" :poll-time="onuModalPollTime" @close="onuModalOpen = false" />
  </main>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { apiFetch, apiPost } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { usePolling } from '../../composables/usePolling'
import StatusMessage from '../shared/StatusMessage.vue'
import OnuModal from './OnuModal.vue'

const auth = useAuthStore()
const profiles = ref([])
const jobs = ref([])
const sessions = ref([])
const configOpen = ref(true)
const editId = ref('')
const pollingId = ref(null)

const emptyForm = () => ({
  name: '', ip: '', olt_model: 'V1600G1', conn_type: 'auto',
  ssh_port: '22', telnet_port: '23', username: '', password: '',
  enable_pass: '', uplink_ports: 'gigabitethernet 0/10'
})
const form = reactive(emptyForm())

const emptyJob = () => ({ profile_id: '', poll_type: 'onu', run_mode: 'repeat', start_at: '', interval_min: '60', selected_ports: '' })
const job = ref(emptyJob())
const editJobId = ref('')

const profileMsg = ref(''); const profileOk = ref(false)
const actionMsg = ref(''); const actionOk = ref(false)
const jobMsg = ref(''); const jobOk = ref(false)

const onuModalOpen = ref(false)
const onuModalIp = ref('')
const onuModalName = ref('')
const onuModalOnus = ref([])
const onuModalPollTime = ref(null)

const sessionPage = ref(0)
const sessionPageSize = 15
const pagedSessions = computed(() => sessions.value.slice(sessionPage.value * sessionPageSize, (sessionPage.value + 1) * sessionPageSize))

const lastPoll = computed(() => {
  if (!sessions.value.length) return '?'
  return new Date(sessions.value[0].poll_time).toLocaleTimeString()
})
const snapshot = computed(() => {
  for (const s of sessions.value) {
    if (s.onu_count != null) {
      return { total: s.onu_count, online: s.online_count ?? '-', offline: s.offline_count ?? '-' }
    }
  }
  return { total: '?', online: '?', offline: '?' }
})

function flash(msgRef, okRef, m, ok) { msgRef.value = m; okRef.value = ok }

async function load() {
  try {
    const p = await apiFetch('/api/olt/profiles')
    profiles.value = Array.isArray(p) ? p : []
  } catch (_) {}
  try {
    const s = await apiFetch('/api/olt/sessions')
    sessions.value = Array.isArray(s) ? s : []
  } catch (_) {}
}
usePolling(load, 15000)

async function loadJobs() {
  try {
    const j = await apiFetch('/api/olt/jobs')
    jobs.value = Array.isArray(j) ? j : []
  } catch (_) {}
}
loadJobs()

function jobOltName(j) {
  const p = profiles.value.find(x => String(x.id) === String(j.profile_id))
  return p ? (p.name || p.ip) : ('Profile #' + j.profile_id)
}

async function saveProfile() {
  const d = { ...form, id: editId.value }
  if (!d.ip || !d.username) { flash(profileMsg, profileOk, 'IP and username are required', false); return }
  if (!editId.value && !d.password) { flash(profileMsg, profileOk, 'IP, username and password are required', false); return }
  if (!d.enable_pass && d.password) d.enable_pass = d.password
  try {
    const r = await apiPost(editId.value ? '/api/olt/profiles/update' : '/api/olt/profiles/add', d)
    if (r.success) {
      flash(profileMsg, profileOk, editId.value ? 'OLT profile updated!' : 'OLT profile added!', true)
      cancelEdit()
      load()
    } else flash(profileMsg, profileOk, 'Error: ' + (r.error || 'Failed'), false)
  } catch (e) { flash(profileMsg, profileOk, 'Request failed: ' + e.message, false) }
}

function startEdit(p) {
  editId.value = String(p.id)
  Object.assign(form, {
    name: p.name || '', ip: p.ip || '', olt_model: p.olt_model || 'V1600G1',
    conn_type: p.conn_type || 'auto', ssh_port: p.ssh_port || '22', telnet_port: p.telnet_port || '23',
    username: p.username || '', password: '', enable_pass: '',
    uplink_ports: p.uplink_ports || 'gigabitethernet 0/10'
  })
  configOpen.value = true
}

function cancelEdit() {
  editId.value = ''
  Object.assign(form, emptyForm())
}

async function deleteProfile(p) {
  if (!confirm('Delete OLT profile "' + (p.name || p.ip) + '"?')) return
  try { await apiPost('/api/olt/profiles/delete', { id: p.id }); load() } catch (e) { alert(e.message) }
}

function statusColor(s) {
  if (s === 'ok') return 'var(--accent3)'
  if (s === 'never') return 'var(--muted)'
  return 'var(--danger)'
}

async function watchProgress(profileId) {
  pollingId.value = profileId
  const tick = async () => {
    if (pollingId.value !== profileId) return
    try {
      const pr = await apiFetch('/api/olt/poll_progress?id=' + encodeURIComponent(profileId))
      if (pr && pr.status === 'running') {
        flash(actionMsg, actionOk, (pr.stage || 'Polling') + (pr.detail ? ': ' + pr.detail : '') + '...', true)
        setTimeout(tick, 1000)
      } else {
        pollingId.value = null
      }
    } catch (_) { pollingId.value = null }
  }
  tick()
}

async function pollOnu(p) {
  pollingId.value = p.id
  flash(actionMsg, actionOk, 'Fetching ONU data from ' + (p.name || p.ip) + '...', true)
  watchProgress(p.id)
  try {
    const r = await apiPost('/api/olt/poll_onu', { id: p.id })
    pollingId.value = null
    if (r.success) {
      flash(actionMsg, actionOk,
        `ONU data done: ${r.onu_count} ONUs (${r.online_count} online) via ${(r.method || '?').toUpperCase()} in ${r.duration}s`, true)
      onuModalIp.value = p.ip
      onuModalName.value = p.name || p.ip
      onuModalOnus.value = r.onus || []
      onuModalPollTime.value = r.poll_time || null
      onuModalOpen.value = true
      load()
    } else {
      pollingId.value = null
      flash(actionMsg, actionOk, 'ONU fetch failed: ' + (r.error || 'Unknown error'), false)
    }
  } catch (e) {
    pollingId.value = null
    flash(actionMsg, actionOk, 'Error: ' + e.message, false)
  }
}

async function viewOnus(p) {
  onuModalIp.value = p.ip
  onuModalName.value = p.name || p.ip
  onuModalOnus.value = []
  onuModalPollTime.value = null
  onuModalOpen.value = true
}

async function pollUplink(p) {
  flash(actionMsg, actionOk, 'Fetching uplink stats from ' + (p.name || p.ip) + '...', true)
  try {
    const savedPorts = (p.uplink_ports || '').split(',').map(s => s.trim()).filter(Boolean)
    const r = await apiPost('/api/olt/poll_uplink', { id: p.id, interfaces: savedPorts })
    if (r.success !== false) {
      flash(actionMsg, actionOk, 'Uplink data fetched. See UPLINK Traffic tab.', true)
      window.dispatchEvent(new CustomEvent('noc-uplink-updated'))
    } else flash(actionMsg, actionOk, 'Uplink fetch failed: ' + (r.error || 'Unknown error'), false)
  } catch (e) { flash(actionMsg, actionOk, 'Error: ' + e.message, false) }
}

function onJobTypeChange() { /* port select shows saved profile ports */ }

function startJobEdit(j) {
  editJobId.value = String(j.id)
  job.value = {
    profile_id: String(j.profile_id),
    poll_type: j.poll_type || 'onu',
    run_mode: j.run_mode || 'repeat',
    start_at: j.start_at ? j.start_at.slice(0, 16) : '',
    interval_min: String(j.interval_min || 60),
    selected_ports: j.selected_ports || ''
  }
}

function cancelJobEdit() {
  editJobId.value = ''
  job.value = emptyJob()
}

async function saveJob() {
  const body = { ...job.value }
  if (!body.profile_id) { flash(jobMsg, jobOk, 'Select an OLT profile first.', false); return }
  if (!body.start_at) {
    const dt = new Date(Date.now() + 5 * 60000)
    body.start_at = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  try {
    const url = editJobId.value ? '/api/olt/jobs/update' : '/api/olt/jobs/add'
    const payload = editJobId.value ? { ...body, id: editJobId.value } : body
    const r = await apiPost(url, payload)
    if (r.success) {
      flash(jobMsg, jobOk, editJobId.value ? 'Automatic poll schedule updated.' : 'Automatic poll saved.', true)
      cancelJobEdit()
      loadJobs()
    } else {
      flash(jobMsg, jobOk, 'Error: ' + (r.error || 'Failed to save job'), false)
    }
  } catch (e) { flash(jobMsg, jobOk, 'Request failed: ' + e.message, false) }
}

async function toggleJob(j) {
  try { await apiPost('/api/olt/jobs/toggle', { id: j.id }); loadJobs() } catch (_) {}
}
async function deleteJob(j) {
  if (!confirm('Delete this automatic poll job?')) return
  try { await apiPost('/api/olt/jobs/delete', { id: j.id }); loadJobs() } catch (_) {}
}

function oltBadgeClass(id) {
  const colors = ['bc', 'bo', 'bg', 'by']
  const i = id ? (id.charCodeAt(id.length - 1) % 4) : 0
  return colors[i]
}
</script>
