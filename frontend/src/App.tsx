import React, { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { AppLayout } from './components/layout/AppLayout'
import { LoginView } from './views/LoginView'
import { HealthDashboardView } from './views/HealthDashboardView'
import { SyslogView } from './views/SyslogView'
import { SnmpTrapsView } from './views/SnmpTrapsView'
import { TftpBackupsView } from './views/TftpBackupsView'
import { PingMonitorView } from './views/PingMonitorView'
import { AlertsView } from './views/AlertsView'
import { OltConnectView } from './views/OltConnectView'
import { UplinkTrafficView } from './views/UplinkTrafficView'
import { OntLookupView } from './views/OntLookupView'
import { LogsView } from './views/LogsView'
import { UsersView } from './views/UsersView'
import { RestartModal } from './components/layout/RestartModal'
import { ShutdownModal } from './components/layout/ShutdownModal'
import { RadioTower } from 'lucide-react'

export const App: React.FC = () => {
  const { isAuthenticated, loading, visibleTabs, isAdmin } = useAuth()

  const [currentTab, setCurrentTab] = useState<string>(() => {
    return localStorage.getItem('snoc_active_tab') || 'dashboard'
  })

  const [restartTarget, setRestartTarget] = useState<string | null>(null)
  const [shutdownOpen, setShutdownOpen] = useState<boolean>(false)

  useEffect(() => {
    localStorage.setItem('snoc_active_tab', currentTab)
  }, [currentTab])

  // If active tab gets restricted for current user, fallback to dashboard
  useEffect(() => {
    if (!isAdmin && visibleTabs.length > 0 && !visibleTabs.includes(currentTab)) {
      setCurrentTab('dashboard')
    }
  }, [visibleTabs, isAdmin, currentTab])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-glow-cyan">
          <RadioTower className="w-6 h-6 animate-pulse" />
        </div>
        <div className="text-xs font-mono text-cyan-400 uppercase tracking-widest animate-pulse">
          Connecting to Smart NOC Engine...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginView />
  }

  const renderView = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <HealthDashboardView
            onOpenRestart={t => setRestartTarget(t)}
            onOpenShutdown={() => setShutdownOpen(true)}
          />
        )
      case 'syslog':
        return <SyslogView />
      case 'snmp':
        return <SnmpTrapsView />
      case 'tftp':
        return <TftpBackupsView />
      case 'ping':
        return <PingMonitorView />
      case 'alerts':
        return <AlertsView />
      case 'olt':
        return <OltConnectView />
      case 'uplink':
        return <UplinkTrafficView />
      case 'ont':
        return <OntLookupView />
      case 'logs':
        return <LogsView />
      case 'users':
        return <UsersView />
      default:
        return (
          <HealthDashboardView
            onOpenRestart={t => setRestartTarget(t)}
            onOpenShutdown={() => setShutdownOpen(true)}
          />
        )
    }
  }

  return (
    <AppLayout currentTab={currentTab} onSelectTab={setCurrentTab}>
      {renderView()}

      {restartTarget && (
        <RestartModal
          target={restartTarget}
          onClose={() => setRestartTarget(null)}
          onSuccess={() => setRestartTarget(null)}
        />
      )}

      {shutdownOpen && (
        <ShutdownModal onClose={() => setShutdownOpen(false)} />
      )}
    </AppLayout>
  )
}
