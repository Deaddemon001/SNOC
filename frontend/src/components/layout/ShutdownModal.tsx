import React, { useState } from 'react'
import { Power, X, AlertOctagon } from 'lucide-react'
import { apiPost } from '../../api'

interface ShutdownModalProps {
  onClose: () => void
}

export const ShutdownModal: React.FC<ShutdownModalProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleShutdown = async () => {
    setLoading(true)
    setError('')
    try {
      await apiPost('/api/system/shutdown', {})
      onClose()
    } catch (e: any) {
      setError(e.message || 'Request failed')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-xl bg-slate-900 border border-rose-500/40 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Power className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">Shutdown Smart NOC Application</h3>
            <p className="text-xs font-mono text-rose-400">Terminates all background services</p>
          </div>
        </div>

        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3.5 mb-5 flex items-start gap-2.5 text-xs text-rose-200">
          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Warning: Headless Stop</p>
            <p>
              This will immediately terminate the API server, SNMP receiver, Syslog collector, and TFTP daemon. You must manually run <code>START_NOC.bat</code> or <code>launcher.pyw</code> on the host PC to bring the system back up.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono">
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
            onClick={handleShutdown}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all"
          >
            {loading ? 'Shutting down...' : 'Confirm Shutdown'}
          </button>
        </div>
      </div>
    </div>
  )
}
