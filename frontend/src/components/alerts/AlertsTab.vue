<template>
  <main>
    <div class="srow">
      <div class="sc g"><div class="sl">Rules Active</div><div class="sv">{{ activeRules }}</div><div class="ss">monitoring</div></div>
      <div class="sc c"><div class="sl">Alerts Sent</div><div class="sv">{{ stats.total_sent ?? 0 }}</div><div class="ss">all time</div></div>
      <div class="sc r"><div class="sl">Send Failures</div><div class="sv">{{ stats.total_failed ?? 0 }}</div><div class="ss">check email config</div></div>
      <div class="sc o"><div class="sl">Total Rules</div><div class="sv">{{ rules.length }}</div><div class="ss">configured</div></div>
    </div>

    <div class="crow">
      <!-- Email Config -->
      <div class="panel">
        <div class="ph"><div class="pt">Email Config</div><div class="pb2">{{ email.enabled ? 'Enabled' : 'Not configured' }}</div></div>
        <div class="pb" style="display:grid;gap:10px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label class="flabel">SMTP HOST</label><input v-model="email.smtp_host" class="finp" placeholder="smtp.gmail.com" /></div>
            <div><label class="flabel">SMTP PORT</label><input v-model.number="email.smtp_port" class="finp" placeholder="587" /></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label class="flabel">USERNAME</label><input v-model="email.smtp_user" class="finp" placeholder="your@email.com" /></div>
            <div><label class="flabel">PASSWORD</label><input v-model="email.smtp_pass" type="password" class="finp" placeholder="app password" /></div>
          </div>
          <div><label class="flabel">FROM ADDRESS</label><input v-model="email.from_addr" class="finp" placeholder="noc@yourdomain.com" /></div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <label class="chk"><input type="checkbox" v-model="email.use_tls" /> USE TLS</label>
            <label class="chk"><input type="checkbox" v-model="email.enabled" /> EMAIL ALERTS ENABLED</label>
          </div>
          <StatusMessage :msg="emailMsg" :ok="emailOk" />
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button v-if="auth.isAdmin" class="rb" style="padding:9px 14px" @click="saveEmail">Save Email Config</button>
            <button v-if="auth.isAdmin" class="ubtn" style="padding:9px 14px" @click="testEmail">Send Test</button>
          </div>
          <div v-if="diagText" style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;white-space:pre-wrap">{{ diagText }}</div>
        </div>
      </div>

      <!-- Telegram + Discord -->
      <div class="panel">
        <div class="ph"><div class="pt">Telegram &amp; Discord</div><div class="pb2">Channel delivery</div></div>
        <div class="pb" style="display:grid;gap:10px">
          <div><label class="flabel">TELEGRAM BOT TOKEN</label><input v-model="telegram.bot_token" class="finp" placeholder="123456:ABC-DEF..." /></div>
          <div><label class="flabel">TELEGRAM CHAT ID</label><input v-model="telegram.chat_id" class="finp" placeholder="-1001234567890" /></div>
          <label class="chk"><input type="checkbox" v-model="telegram.enabled" /> TELEGRAM ENABLED</label>
          <StatusMessage :msg="tgMsg" :ok="tgOk" />
          <div style="display:flex;gap:8px">
            <button v-if="auth.isAdmin" class="rb" style="padding:9px 14px" @click="saveTelegram">Save Telegram</button>
            <button v-if="auth.isAdmin" class="ubtn" style="padding:9px 14px" @click="testTelegram">Send Test</button>
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:6px 0" />
          <div><label class="flabel">DISCORD WEBHOOK URL</label><input v-model="discord.webhook_url" class="finp" placeholder="https://discord.com/api/webhooks/..." /></div>
          <label class="chk"><input type="checkbox" v-model="discord.enabled" /> DISCORD ENABLED</label>
          <StatusMessage :msg="dcMsg" :ok="dcOk" />
          <div style="display:flex;gap:8px">
            <button v-if="auth.isAdmin" class="rb" style="padding:9px 14px" @click="saveDiscord">Save Discord</button>
            <button v-if="auth.isAdmin" class="ubtn" style="padding:9px 14px" @click="testDiscord">Send Test</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Rule -->
    <div v-if="auth.isAdmin" class="panel">
      <div class="ph"><div class="pt">Add Alert Rule</div><div class="pb2">Syslog or Ping Monitor notifications</div></div>
      <div class="pb" style="display:grid;gap:10px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
          <div><label class="flabel">RULE NAME</label><input v-model="newRule.name" class="finp" placeholder="e.g. BSNL_TMG Uplink Alert" /></div>
          <div>
            <label class="flabel">ALERT SOURCE</label>
            <select v-model="newRule.source_type" class="finp">
              <option value="syslog">Syslog</option>
              <option value="ping">Ping Monitor Offline</option>
            </select>
          </div>
          <div><label class="flabel">HOST MATCH (empty = all)</label><input v-model="newRule.host_match" class="finp" placeholder="e.g. BSNL_TMG" /></div>
          <div><label class="flabel">SEND ALERT TO (Email)</label><input v-model="newRule.to_email" class="finp" placeholder="admin@yourdomain.com" /></div>
        </div>
        <div><label class="flabel">EXCLUDE HOSTS / IPS</label><textarea v-model="newRule.exclude_hosts" class="finp" rows="2" style="resize:vertical;font-family:'Share Tech Mono',monospace;font-size:11px" placeholder="One per line or comma-separated"></textarea></div>
        <div v-if="newRule.source_type === 'syslog'">
          <label class="flabel">TEXT CONTAINS (one per line = AND logic)</label>
          <textarea v-model="newRule.text_match" class="finp" rows="3" style="resize:vertical;font-family:'Share Tech Mono',monospace;font-size:11px" placeholder="Uplink-port&#10;Down"></textarea>
        </div>
        <div>
          <label class="flabel">NOTIFY VIA</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">
            <label class="chk"><input type="checkbox" value="email" v-model="notifyVia" /> Email</label>
            <label class="chk"><input type="checkbox" value="telegram" v-model="notifyVia" /> Telegram</label>
            <label class="chk"><input type="checkbox" value="discord" v-model="notifyVia" /> Discord</label>
          </div>
        </div>
        <StatusMessage :msg="ruleMsg" :ok="ruleOk" />
        <button class="rb" style="padding:9px;width:fit-content" @click="addRule">+ Add Rule</button>
      </div>
    </div>

    <!-- Rules Table -->
    <div class="panel">
      <div class="ph"><div class="pt">Alert Rules</div><div class="pb2">{{ rules.length }} rules</div></div>
      <div class="tw">
        <table>
          <thead><tr><th>#</th><th>Rule Name</th><th>Source</th><th>Host Match</th><th>Exclude</th><th>Text Contains</th><th>Send To</th><th>Hits</th><th>Last Hit</th><th>Status</th><th v-if="auth.isAdmin">Action</th></tr></thead>
          <tbody>
            <tr v-if="!rules.length"><td :colspan="auth.isAdmin ? 11 : 10"><div class="empty">No rules yet. Add one above.</div></td></tr>
            <tr v-for="(r, i) in rules" :key="r.id">
              <td>{{ i + 1 }}</td>
              <td>{{ r.name }}</td>
              <td><span class="b bc">{{ r.source_type }}</span></td>
              <td style="font-size:11px">{{ r.host_match || 'All' }}</td>
              <td style="font-size:10px;color:var(--muted)">{{ r.exclude_hosts || '-' }}</td>
              <td style="font-size:10px;color:var(--muted)">{{ r.text_match || '-' }}</td>
              <td style="font-size:11px">{{ r.to_email || '-' }}</td>
              <td>{{ r.hit_count ?? 0 }}</td>
              <td style="font-size:10px">{{ r.last_hit ? new Date(r.last_hit).toLocaleString() : 'Never' }}</td>
              <td><span class="b" :class="r.enabled ? 'bg' : 'bx'">{{ r.enabled ? 'ACTIVE' : 'PAUSED' }}</span></td>
              <td v-if="auth.isAdmin" style="white-space:nowrap">
                <button class="ubtn" style="padding:3px 8px;font-size:10px;margin-right:3px" @click="toggleRule(r)">{{ r.enabled ? 'Off' : 'On' }}</button>
                <button class="ubtn" style="padding:3px 8px;font-size:10px;margin-right:3px;border-color:var(--accent2);color:var(--accent2)" @click="openEdit(r)">Edit</button>
                <button class="lbtn" style="padding:3px 8px;font-size:10px" @click="deleteRule(r)">Del</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Alert Log -->
    <div class="panel">
      <div class="ph"><div class="pt">Alert Log</div><div class="pb2">{{ logs.length }}</div></div>
      <div class="tw">
        <table>
          <thead><tr><th>Time</th><th>Rule</th><th>Host</th><th>Sent</th><th>Message</th></tr></thead>
          <tbody>
            <tr v-if="!logs.length"><td colspan="5"><div class="empty">No alerts sent yet.</div></td></tr>
            <tr v-for="l in logs.slice(0, 100)" :key="l.id">
              <td style="font-size:11px">{{ l.timestamp ? new Date(l.timestamp).toLocaleString() : '-' }}</td>
              <td>{{ l.rule_name || '-' }}</td>
              <td style="font-size:11px">{{ l.host || '-' }}</td>
              <td><span class="b" :class="l.sent ? 'bg' : 'br'">{{ l.sent ? 'SENT' : 'FAILED' }}</span></td>
              <td style="font-size:11px;color:var(--muted)">{{ (l.error || l.message || '').substring(0, 80) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Email Template -->
    <div v-if="auth.isAdmin" class="panel">
      <div class="ph" style="cursor:pointer" @click="tplOpen = !tplOpen">
        <div class="pt">Email Template</div>
        <div class="pb2">{{ tplOpen ? 'collapse' : 'customize alert emails' }}</div>
      </div>
      <div v-if="tplOpen" class="pb" style="display:grid;gap:10px">
        <div><label class="flabel">SUBJECT</label><input v-model="tpl.subject" class="finp" /></div>
        <div><label class="flabel">BODY (supports {host}, {message}, {time} placeholders)</label><textarea v-model="tpl.body" class="finp" rows="6" style="resize:vertical;font-family:'Share Tech Mono',monospace;font-size:11px"></textarea></div>
        <StatusMessage :msg="tplMsg" :ok="tplOk" />
        <div style="display:flex;gap:8px">
          <button class="rb" style="padding:9px 14px" @click="saveTemplate">Save Template</button>
          <button class="ubtn" style="padding:9px 14px" @click="resetTemplate">Reset Default</button>
        </div>
      </div>
    </div>

    <!-- Edit Rule Modal -->
    <div v-if="editRule" class="modal-overlay show" @click.self="editRule = null">
      <div class="modal-panel">
        <h3>Edit Alert Rule</h3>
        <div style="display:grid;gap:10px">
          <div><label class="flabel">RULE NAME</label><input v-model="editRule.name" class="finp" /></div>
          <div><label class="flabel">HOST MATCH</label><input v-model="editRule.host_match" class="finp" /></div>
          <div><label class="flabel">EXCLUDE HOSTS</label><textarea v-model="editRule.exclude_hosts" class="finp" rows="2" style="font-family:'Share Tech Mono',monospace;font-size:11px"></textarea></div>
          <div><label class="flabel">TEXT CONTAINS</label><textarea v-model="editRule.text_match" class="finp" rows="3" style="font-family:'Share Tech Mono',monospace;font-size:11px"></textarea></div>
          <div><label class="flabel">SEND TO (Email)</label><input v-model="editRule.to_email" class="finp" /></div>
          <StatusMessage :msg="editMsg" :ok="editOk" />
          <div style="display:flex;justify-content:flex-end;gap:10px">
            <button class="rbtn" @click="editRule = null">Cancel</button>
            <button class="rb" @click="saveEdit">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { apiFetch, apiPost } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { usePolling } from '../../composables/usePolling'
import StatusMessage from '../shared/StatusMessage.vue'

const auth = useAuthStore()
const stats = ref({})
const rules = ref([])
const logs = ref([])
const tplOpen = ref(false)

const activeRules = computed(() => rules.value.filter(r => r.enabled).length)

const email = ref({ smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', from_addr: '', use_tls: true, enabled: false })
const telegram = ref({ bot_token: '', chat_id: '', enabled: false })
const discord = ref({ webhook_url: '', enabled: false })
const newRule = ref({ name: '', source_type: 'syslog', host_match: '', exclude_hosts: '', text_match: '', to_email: '' })
const notifyVia = ref(['email'])
const editRule = ref(null)
const tpl = ref({ subject: '', body: '' })

const emailMsg = ref(''); const emailOk = ref(false)
const tgMsg = ref(''); const tgOk = ref(false)
const dcMsg = ref(''); const dcOk = ref(false)
const ruleMsg = ref(''); const ruleOk = ref(false)
const editMsg = ref(''); const editOk = ref(false)
const tplMsg = ref(''); const tplOk = ref(false)
const diagText = ref('')

function flash(m, ok, setMsg, setOk) { setMsg.value = m; setOk.value = ok }

async function load() {
  try {
    const d = await apiFetch('/api/alerts/stats')
    stats.value = d || {}
    rules.value = Array.isArray(d?.rules) ? d.rules : []
  } catch (_) {}
  try {
    const l = await apiFetch('/api/alerts/log')
    logs.value = Array.isArray(l) ? l : []
  } catch (_) {}
}
usePolling(load, 15000)

async function loadConfigs() {
  try { email.value = { ...email.value, ...(await apiFetch('/api/alerts/email_config')) } } catch (_) {}
  try { telegram.value = { ...telegram.value, ...(await apiFetch('/api/alerts/telegram_config')) } } catch (_) {}
  try { discord.value = { ...discord.value, ...(await apiFetch('/api/alerts/discord_config')) } } catch (_) {}
  try { tpl.value = { ...tpl.value, ...(await apiFetch('/api/alerts/template')) } } catch (_) {}
}
loadConfigs()

async function saveEmail() {
  try {
    const r = await apiPost('/api/alerts/email_config', email.value)
    flash(r.success ? 'Email config saved.' : ('Error: ' + (r.error || 'failed')), !!r.success, emailMsg, emailOk)
  } catch (e) { flash('Error: ' + e.message, false, emailMsg, emailOk) }
}

async function testEmail() {
  const to = prompt('Send test email to:', email.value.from_addr || '')
  if (!to) return
  flash('Sending test email...', true, emailMsg, emailOk)
  try {
    const r = await apiPost('/api/alerts/test_email', { to_email: to })
    if (r.success) {
      flash('Test email sent!', true, emailMsg, emailOk)
      try { const d = await apiFetch('/api/alerts/email_diag'); diagText.value = typeof d === 'string' ? d : JSON.stringify(d, null, 2) } catch (_) {}
    } else flash('ERROR: ' + (r.error || 'failed'), false, emailMsg, emailOk)
  } catch (e) { flash('Request failed: ' + e.message, false, emailMsg, emailOk) }
}

async function saveTelegram() {
  try {
    const r = await apiPost('/api/alerts/telegram_config', telegram.value)
    flash(r.success ? 'Telegram config saved.' : ('Error: ' + (r.error || 'failed')), !!r.success, tgMsg, tgOk)
  } catch (e) { flash('Error: ' + e.message, false, tgMsg, tgOk) }
}

async function testTelegram() {
  flash('Sending test message...', true, tgMsg, tgOk)
  try {
    const r = await apiPost('/api/alerts/test_telegram', {})
    flash(r.success ? String(r.message || 'Telegram sent!') : ('ERROR: ' + r.error), !!r.success, tgMsg, tgOk)
  } catch (e) { flash('Request failed: ' + e.message, false, tgMsg, tgOk) }
}

async function saveDiscord() {
  try {
    const r = await apiPost('/api/alerts/discord_config', discord.value)
    flash(r.success ? 'Discord config saved.' : ('Error: ' + (r.error || 'failed')), !!r.success, dcMsg, dcOk)
  } catch (e) { flash('Error: ' + e.message, false, dcMsg, dcOk) }
}

async function testDiscord() {
  flash('Sending test message...', true, dcMsg, dcOk)
  try {
    const r = await apiPost('/api/alerts/test_discord', {})
    flash(r.success ? String(r.message || 'Discord sent!') : ('ERROR: ' + r.error), !!r.success, dcMsg, dcOk)
  } catch (e) { flash('Request failed: ' + e.message, false, dcMsg, dcOk) }
}

async function addRule() {
  const n = newRule.value
  if (!n.name.trim()) { flash('Rule name is required.', false, ruleMsg, ruleOk); return }
  try {
    const r = await apiPost('/api/alerts/rules/add', {
      name: n.name.trim(), source_type: n.source_type, host_match: n.host_match.trim(),
      exclude_hosts: n.exclude_hosts.trim(), text_match: n.text_match.trim(),
      to_email: n.to_email.trim(), notify_via: notifyVia.value.join(',')
    })
    if (r.success !== false) {
      flash('Rule added.', true, ruleMsg, ruleOk)
      newRule.value = { name: '', source_type: 'syslog', host_match: '', exclude_hosts: '', text_match: '', to_email: '' }
      load()
    } else flash('Error: ' + (r.error || 'failed'), false, ruleMsg, ruleOk)
  } catch (e) { flash('Request failed: ' + e.message, false, ruleMsg, ruleOk) }
}

async function toggleRule(r) {
  try { await apiPost('/api/alerts/rules/toggle', { id: r.id }); load() } catch (_) {}
}
async function deleteRule(r) {
  if (!confirm('Delete rule "' + r.name + '"?')) return
  try { await apiPost('/api/alerts/rules/delete', { id: r.id }); load() } catch (_) {}
}

function openEdit(r) {
  editRule.value = { ...r }
  editMsg.value = ''
}

async function saveEdit() {
  const d = editRule.value
  try {
    const r = await apiPost('/api/alerts/rules/edit', d)
    if (r.success !== false) { editRule.value = null; load() }
    else flash('Error: ' + (r.error || 'failed'), false, editMsg, editOk)
  } catch (e) { flash('Request failed: ' + e.message, false, editMsg, editOk) }
}

async function saveTemplate() {
  try {
    const r = await apiPost('/api/alerts/template', { subject: tpl.value.subject, body: tpl.value.body })
    flash(r.success !== false ? 'Template saved.' : ('Error: ' + (r.error || 'failed')), r.success !== false, tplMsg, tplOk)
  } catch (e) { flash('Request failed: ' + e.message, false, tplMsg, tplOk) }
}

async function resetTemplate() {
  if (!confirm('Reset template to default?')) return
  try {
    await apiPost('/api/alerts/template', { subject: 'Smart NOC Alert [{host}]', body: 'Host: {host}\nTime: {time}\n\n{message}' })
    const t = await apiFetch('/api/alerts/template')
    tpl.value = { ...tpl.value, ...t }
    flash('Template reset to default.', true, tplMsg, tplOk)
  } catch (e) { flash('Request failed: ' + e.message, false, tplMsg, tplOk) }
}
</script>

<style scoped>
.chk { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: var(--text); }
</style>
