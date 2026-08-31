import React from 'react'

interface StatusMessageProps {
  msg?: string
  ok?: boolean
  loading?: boolean
  pre?: boolean
}

export const StatusMessage: React.FC<StatusMessageProps> = ({ msg, ok = false, loading = false, pre = false }) => {
  if (!msg) return null

  return (
    <div
      className={`rounded-lg px-3 py-2 text-xs font-mono border transition-all ${
        loading
          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
          : ok
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
      }`}
    >
      {pre ? <pre className="whitespace-pre-wrap font-mono m-0 text-xs">{msg}</pre> : msg}
    </div>
  )
}
