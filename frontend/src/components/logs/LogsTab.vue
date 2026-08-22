<template>
  <main>
    <div class="panel" style="margin-top:12px">
      <div class="ph"><div class="pt">Application Logs</div><div class="pb2">{{ meta }}</div></div>
      <div class="pb" style="display:grid;gap:10px">
        <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
          <div style="display:grid;gap:4px">
            <label class="flabel" style="margin:0">Log file</label>
            <select v-model="selFile" class="fsel" style="min-width:220px" @change="loadSelected">
              <option value="">- select log -</option>
              <option v-for="it in items" :key="it.name" :value="it.name">{{ it.name }}</option>
            </select>
          </div>
          <div style="display:grid;gap:4px">
            <label class="flabel" style="margin:0">Tail lines</label>
            <select v-model.number="tail" class="fsel" style="min-width:140px" @change="loadSelected">
              <option :value="200">200</option>
              <option :value="500">500</option>
              <option :value="1000">1000</option>
              <option :value="2000">2000</option>
            </select>
          </div>
          <div style="display:grid;gap:4px;flex:1;min-width:180px">
            <label class="flabel" style="margin:0">Search</label>
            <input v-model="search" class="finp" placeholder="filter lines..." />
          </div>
          <button class="rb" style="padding:7px 14px;font-size:11px" @click="refreshLogs">&#8634; Refresh</button>
        </div>
        <StatusMessage :msg="msg" :ok="ok" />
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <pre style="margin:0;padding:12px;background:rgba(0,0,0,0.25);color:var(--accent3);font-family:'Share Tech Mono',monospace;font-size:11px;line-height:1.6;max-height:60vh;overflow:auto">{{ visibleLines.join('\n') || 'Select a log file to view.' }}</pre>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { apiFetch } from '../../api'
import StatusMessage from '../shared/StatusMessage.vue'

const items = ref([])
const selFile = ref('')
const tail = ref(500)
const search = ref('')
const lines = ref([])
const msg = ref('')
const ok = ref(false)
const meta = ref('-')

const visibleLines = computed(() => {
  const s = search.value.toLowerCase().trim()
  if (!s) return lines.value
  return lines.value.filter(l => l.toLowerCase().includes(s))
})

async function loadList() {
  try {
    items.value = await apiFetch('/api/logs/list')
  } catch (e) { msg.value = e.message || 'Failed to load logs list'; ok.value = false }
}

async function loadSelected() {
  if (!selFile.value) { lines.value = []; meta.value = '-'; return }
  try {
    const r = await apiFetch('/api/logs/read?name=' + encodeURIComponent(selFile.value) + '&tail=' + tail.value)
    lines.value = r.lines || []
    meta.value = (r.file || selFile.value) + ' - last ' + lines.value.length + ' lines'
  } catch (e) { msg.value = e.message; ok.value = false }
}

function refreshLogs() {
  loadList()
  loadSelected()
}

loadList()
</script>
