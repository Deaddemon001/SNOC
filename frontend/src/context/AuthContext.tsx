import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch, apiPost, setUnauthorizedHandler } from '../api'

export const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'Activity' },
  { id: 'syslog', label: 'Syslog', icon: 'FileText' },
  { id: 'snmp', label: 'SNMP Traps', icon: 'Radio' },
  { id: 'tftp', label: 'TFTP Backups', icon: 'HardDrive' },
  { id: 'ping', label: 'Ping Monitor', icon: 'Zap' },
  { id: 'alerts', label: 'Alert Rules', icon: 'Bell' },
  { id: 'olt', label: 'OLT Connect', icon: 'Server' },
  { id: 'uplink', label: 'Uplink Traffic', icon: 'TrendingUp' },
  { id: 'ont', label: 'ONT Lookup', icon: 'Search' },
  { id: 'logs', label: 'System Logs', icon: 'Terminal' },
  { id: 'users', label: 'User Admin', icon: 'Users' }
]

export const SETTINGS_TAB_OPTIONS = [
  { id: 'syslog', label: 'Syslog' },
  { id: 'snmp', label: 'SNMP Traps' },
  { id: 'tftp', label: 'TFTP Backups' },
  { id: 'ping', label: 'Ping Monitor' },
  { id: 'alerts', label: 'Alert Rules' },
  { id: 'olt', label: 'OLT Connect' },
  { id: 'uplink', label: 'Uplink Traffic' },
  { id: 'ont', label: 'ONT Lookup' },
  { id: 'logs', label: 'System Logs' }
]

export function getDefaultTabsForRole(role: string): string[] {
  if (role === 'admin') {
    return ALL_TABS.map(t => t.id)
  }
  return ['dashboard', 'syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink', 'ont']
}

export function roleLabel(role: string): string {
  return role === 'admin' ? 'ADMIN' : 'READ-ONLY'
}

interface AuthContextType {
  username: string
  role: string
  visibleTabs: string[]
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (u: string, p: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  applyGlobalTabs: (tabs: string[]) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsername] = useState<string>('')
  const [role, setRole] = useState<string>('')
  const [visibleTabs, setVisibleTabs] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const checkAuth = useCallback(async () => {
    try {
      const d = await apiFetch('/api/auth/me')
      if (d && (d.logged_in || d.authenticated || d.username)) {
        setUsername(d.username || '')
        setRole(d.role || 'viewer')
        if (d.role === 'admin') {
          setVisibleTabs(getDefaultTabsForRole('admin'))
        } else {
          const tabs = (d.effective_visible_tabs && d.effective_visible_tabs.length)
            ? d.effective_visible_tabs
            : (d.visible_tabs && d.visible_tabs.length)
            ? d.visible_tabs
            : getDefaultTabsForRole(d.role || 'viewer')
          setVisibleTabs(tabs)
        }
      } else {
        setUsername('')
        setRole('')
        setVisibleTabs([])
      }
    } catch (_) {
      setUsername('')
      setRole('')
      setVisibleTabs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUsername('')
      setRole('')
      setVisibleTabs([])
    })
    checkAuth()
  }, [checkAuth])

  const login = async (u: string, p: string) => {
    try {
      const d = await apiPost('/api/auth/login', { username: u.trim(), password: p })
      if (d.success) {
        await checkAuth()
        return { success: true }
      }
      return { success: false, error: d.error || 'Login failed' }
    } catch (e: any) {
      return { success: false, error: e.backendError || e.message || 'Network error' }
    }
  }

  const logout = async () => {
    try {
      await apiPost('/api/auth/logout', {})
    } catch (_) {}
    setUsername('')
    setRole('')
    setVisibleTabs([])
    window.location.href = '/login'
  }

  const applyGlobalTabs = (tabs: string[]) => {
    if (role !== 'admin') {
      const next = tabs.filter(t => visibleTabs.includes(t))
      setVisibleTabs(next.length ? next : getDefaultTabsForRole(role))
    }
  }

  const isAuthenticated = Boolean(username)
  const isAdmin = role === 'admin'

  return (
    <AuthContext.Provider
      value={{
        username,
        role,
        visibleTabs,
        isAuthenticated,
        isAdmin,
        loading,
        login,
        logout,
        checkAuth,
        applyGlobalTabs
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
