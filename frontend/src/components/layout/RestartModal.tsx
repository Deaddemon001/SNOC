import React, { useState } from 'react'
import { RotateCw, X, AlertTriangle } from 'lucide-react'
import { apiPost } from '../../api'

interface RestartModalProps {
  target: string
  onClose: () => void
  onSuccess: () => void
}

export const RestartModal: React.FC<RestartModalProps> = ({ target, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isAll = target === 'all'
  const title = isAll ? 'Restart Entire Smart NOC Application' : `Restart ${target.toUpperCase()} Service`

  const handleRestart = async () => {
    setLoading(true)
    setError('')
    try {
      if (isAll) {
        await apiPost('/api/system/restart', {})
        onSuccess()
      } else {
        const res = await apiPost('/api/system/service_action', { action: 'restart', service: target })
        if (res.success) {
          onSuccess()
          onClose()
        } else {
          setError(res.error || 'Restart failed')
          setLoading(false)
        }
      }
    } catch (e: any) {
      setError(e.message || 'Request failed')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <RotateCw className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            <p className="text-xs font-mono text-slate-400">Target: {target.toUpperCase()}</p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3.5 mb-5 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            {isAll ? (
              <p>
                This will gracefully terminate background services (SNMP, Syslog, TFTP) and the API server, then spawn clean processes. The dashboard will automatically reconnect.
              </p>
            ) : (
              <p>
                This will kill the active <code>{target}</code> listener process and spawn a fresh process. Ingestion will pause for 1–2 seconds.
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRestart}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
          >
            {loading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {loading ? 'Initiating Restart...' : 'Confirm Restart'}
          </button>
        </div>
      </div>
    </div>
  )
}
