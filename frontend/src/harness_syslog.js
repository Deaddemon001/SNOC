import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/legacy.css'
import FIXTURES from './fixtures.js'

function report(id, text) {
  const d = document.createElement('pre')
  d.id = id
  d.textContent = text
  document.body.appendChild(d)
}

window.addEventListener('error', e => {
  report('errbox', 'JSERROR: ' + e.message + '\n' + (e.error && e.error.stack ? String(e.error.stack).slice(0, 800) : ''))
})
window.addEventListener('unhandledrejection', e => {
  report('rejbox', 'REJECTION: ' + (e.reason && e.reason.stack ? String(e.reason.stack).slice(0, 800) : String(e.reason)))
})

window.fetch = async (url) => {
  const u = String(url).split('?')[0]
  const exact = FIXTURES[url] !== undefined ? url : Object.keys(FIXTURES).find(k => k.split('?')[0] === u)
  const data = exact ? FIXTURES[exact] : []
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const tabs = [
  ['HealthDashboard', '../src/components/dashboard/HealthDashboard.vue'],
  ['SyslogTab', '../src/components/syslog/SyslogTab.vue'],
  ['SnmpTrapsTab', '../src/components/snmp/SnmpTrapsTab.vue'],
  ['PingMonitorTab', '../src/components/ping/PingMonitorTab.vue'],
  ['TftpBackupsTab', '../src/components/tftp/TftpBackupsTab.vue'],
  ['AlertsTab', '../src/components/alerts/AlertsTab.vue'],
  ['OltConnectTab', '../src/components/olt/OltConnectTab.vue'],
  ['UplinkTrafficTab', '../src/components/uplink/UplinkTrafficTab.vue'],
  ['LogsTab', '../src/components/logs/LogsTab.vue'],
  ['OntLookupTab', '../src/components/ont/OntLookupTab.vue'],
  ['UsersTab', '../src/components/users/UsersTab.vue']
]

for (const [name, path] of tabs) {
  try {
    const { default: Comp } = await import(/* @vite-ignore */ path)
    const host = document.createElement('div')
    host.id = 'host_' + name
    document.body.appendChild(host)
    const app = createApp(Comp)
    app.use(createPinia())
    app.mount(host)
    await new Promise(r => setTimeout(r, 1200))
    const trs = host.querySelectorAll('tr').length
    const srows = host.querySelectorAll('.sc').length
    report('res_' + name, `${name}: mounted, .sc cards=${srows}, table rows=${trs}`)
  } catch (e) {
    report('res_' + name, name + ' FAILED TO MOUNT: ' + e.message + '\n' + String(e.stack || '').slice(0, 600))
  }
}
setTimeout(() => report('done_marker', 'ALL_DONE'), 500)
