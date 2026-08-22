import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../views/DashboardLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../components/dashboard/HealthDashboard.vue') },
      { path: 'syslog', name: 'syslog', component: () => import('../components/syslog/SyslogTab.vue') },
      { path: 'snmp', name: 'snmp', component: () => import('../components/snmp/SnmpTrapsTab.vue') },
      { path: 'tftp', name: 'tftp', component: () => import('../components/tftp/TftpBackupsTab.vue') },
      { path: 'ping', name: 'ping', component: () => import('../components/ping/PingMonitorTab.vue') },
      { path: 'alerts', name: 'alerts', component: () => import('../components/alerts/AlertsTab.vue') },
      { path: 'olt', name: 'olt', component: () => import('../components/olt/OltConnectTab.vue') },
      { path: 'uplink', name: 'uplink', component: () => import('../components/uplink/UplinkTrafficTab.vue') },
      { path: 'logs', name: 'logs', component: () => import('../components/logs/LogsTab.vue') },
      { path: 'ont', name: 'ont', component: () => import('../components/ont/OntLookupTab.vue') },
      { path: 'users', name: 'users', component: () => import('../components/users/UsersTab.vue') }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
