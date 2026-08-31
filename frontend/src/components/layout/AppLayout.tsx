import React, { useState } from 'react'
import {
  Activity,
  FileText,
  Radio,
  HardDrive,
  Zap,
  Bell,
  Server,
  TrendingUp,
  Search,
  Terminal,
  Users,
  Settings as SettingsIcon,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  RadioTower,
  ExternalLink,
  ChevronRight
} from 'lucide-react'
import { useAuth, ALL_TABS, roleLabel } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { SettingsModal } from './SettingsModal'
import { RestartModal } from './RestartModal'
import { ShutdownModal } from './ShutdownModal'

interface AppLayoutProps {
  currentTab: string
  onSelectTab: (id: string) => void
  children: React.ReactNode
}

const TAB_ICONS: Record<string, React.ReactNode> = {
  dashboard: <Activity className="w-4 h-4" />,
  syslog: <FileText className="w-4 h-4" />,
  snmp: <Radio className="w-4 h-4" />,
  tftp: <HardDrive className="w-4 h-4" />,
  ping: <Zap className="w-4 h-4" />,
  alerts: <Bell className="w-4 h-4" />,
  olt: <Server className="w-4 h-4" />,
  uplink: <TrendingUp className="w-4 h-4" />,
  ont: <Search className="w-4 h-4" />,
  logs: <Terminal className="w-4 h-4" />,
  users: <Users className="w-4 h-4" />
}

export const AppLayout: React.FC<AppLayoutProps> = ({ currentTab, onSelectTab, children }) => {
  const { username, role, visibleTabs, isAdmin, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [restartTarget, setRestartTarget] = useState<string | null>(null)
  const [shutdownOpen, setShutdownOpen] = useState(false)

  const appVersion = (window as any).__APP_VERSION__ || '0.6.0'

  const activeTabs = ALL_TABS.filter(t => (isAdmin ? true : visibleTabs.includes(t.id)))
  const currentTabObj = ALL_TABS.find(t => t.id === currentTab) || ALL_TABS[0]

  const switchToLegacy = () => {
    window.location.href = '/?legacy=1'
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── WATERMELON STUDIO SIDEBAR ─────────────────────────────────── */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 glass-sidebar flex flex-col transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-cyan-400 p-[1px] shadow-glow-cyan">
              <div className="w-full h-full rounded-xl bg-slate-950 flex items-center justify-center text-cyan-400">
                <RadioTower className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-wider text-base bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                  Smart NOC
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  v{appVersion}
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                Operations Platform
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
            Platform Modules
          </div>
          {activeTabs.map(tab => {
            const isActive = currentTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onSelectTab(tab.id)
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-cyan-500/5 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-cyan-400' : 'text-slate-500'}>
                    {TAB_ICONS[tab.id] || <Activity className="w-4 h-4" />}
                  </span>
                  <span>{tab.label}</span>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-glow-cyan" />}
              </button>
            )
          })}
        </nav>

        {/* User / Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-2">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs text-cyan-300 border border-slate-700 shrink-0">
                {username ? username[0].toUpperCase() : 'U'}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-slate-200 truncate">{username || 'Operator'}</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                      isAdmin
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    }`}
                  >
                    {roleLabel(role)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 glass-header flex items-center justify-between px-4 sm:px-6 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb / Title */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 font-mono text-xs hidden sm:inline">Smart NOC</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline" />
              <span className="font-bold text-slate-100 flex items-center gap-2">
                <span className="text-cyan-400">{TAB_ICONS[currentTabObj.id]}</span>
                {currentTabObj.label}
              </span>
            </div>
          </div>

          {/* Actions & Utilities */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Legacy switch button */}
            <button
              onClick={switchToLegacy}
              title="Switch to Legacy Single-File Dashboard"
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium text-slate-300 bg-slate-900 border border-slate-700/80 hover:border-cyan-500/40 hover:text-cyan-300 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>⏮ Legacy UI</span>
              <ExternalLink className="w-3 h-3 text-slate-500 hidden sm:inline" />
            </button>

            {/* Settings button */}
            <button
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              title="Toggle Dark / Light Theme"
              className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Tab Page Body */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6">
          {children}
        </main>
      </div>

      {/* Modals */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onOpenRestart={t => {
            setSettingsOpen(false)
            setRestartTarget(t)
          }}
          onOpenShutdown={() => {
            setSettingsOpen(false)
            setShutdownOpen(true)
          }}
        />
      )}

      {restartTarget && (
        <RestartModal
          target={restartTarget}
          onClose={() => setRestartTarget(null)}
          onSuccess={() => {
            setRestartTarget(null)
          }}
        />
      )}

      {shutdownOpen && (
        <ShutdownModal onClose={() => setShutdownOpen(false)} />
      )}
    </div>
  )
}
