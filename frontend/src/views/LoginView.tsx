import React, { useState } from 'react'
import { RadioTower, Lock, User, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export const LoginView: React.FC = () => {
  const { login } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const appVersion = (window as any).__APP_VERSION__ || '0.6.0'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Please provide username and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await login(username, password)
      if (res.success) {
        window.location.href = '/'
      } else {
        setError(res.error || 'Invalid username or password')
        setLoading(false)
      }
    } catch (err: any) {
      setError(err.backendError || err.message || 'Connection error. Is the server running?')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Cyber Grid & Glow */}
      <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />
      <div className="absolute w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      {/* Watermelon Studio Card */}
      <div className="w-full max-w-md relative z-10">
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-8 sm:p-10 shadow-2xl shadow-black/80 backdrop-blur-xl">
          {/* Top Accent Line */}
          <div className="absolute top-0 left-12 right-12 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-600 to-cyan-400 p-[1px] shadow-glow-cyan mb-4">
              <div className="w-full h-full rounded-2xl bg-slate-950 flex items-center justify-center text-cyan-400">
                <RadioTower className="w-7 h-7 animate-pulse" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-wider text-slate-100 uppercase">
              Smart NOC
            </h1>
            <p className="text-xs font-mono text-cyan-400/80 tracking-widest mt-1">
              v{appVersion} &bull; Network Operations Center
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-400 font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-slate-400 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  autoFocus
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-3 rounded-xl font-bold text-sm tracking-wider uppercase bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Footer Security Badge */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] font-mono text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted Session &bull; 24/7 Operations</span>
          </div>
        </div>
      </div>
    </div>
  )
}
