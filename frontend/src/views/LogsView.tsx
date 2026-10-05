import React, { useState, useEffect } from 'react'
import { Terminal, RefreshCw, Search, FileText } from 'lucide-react'
import { apiFetch } from '../api'
import { usePolling } from '../hooks/usePolling'

interface LogFileInfo {
  name: string
  size?: number
  mtime?: string
}

export const LogsView: React.FC = () => {
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([])
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [tailLines, setTailLines] = useState<number>(200)
  const [lines, setLines] = useState<string[]>([])
  const [filterText, setFilterText] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(false)

  const loadList = async () => {
    try {
      const data = await apiFetch('/api/logs/list')
      const list: LogFileInfo[] = Array.isArray(data)
        ? data.map(item => (typeof item === 'string' ? { name: item } : item))
        : []
      setLogFiles(list)
      if (list.length > 0 && !selectedFile) {
        setSelectedFile(list[0].name)
      }
    } catch (_) {}
  }

  useEffect(() => {
    loadList()
  }, [])

  const loadContent = async () => {
    if (!selectedFile) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/logs/read?name=${encodeURIComponent(selectedFile)}&tail=${tailLines}`)
      if (res && Array.isArray(res.lines)) {
        setLines(res.lines)
      } else if (res && typeof res.content === 'string') {
        setLines(res.content.split('\n'))
      } else {
        setLines([])
      }
    } catch (_) {
      setLines([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedFile) {
      loadContent()
    }
  }, [selectedFile, tailLines])

  usePolling(() => {
    if (autoRefresh && selectedFile) {
      loadContent()
    }
  }, 3000)

  const filteredLines = lines.filter(l => {
    if (!filterText.trim()) return true
    return l.toLowerCase().includes(filterText.toLowerCase().trim())
  })

  const getLineClass = (line: string) => {
    const l = line.toUpperCase()
    if (l.includes('ERROR') || l.includes('CRITICAL') || l.includes('EXCEPTION') || l.includes('FAIL')) {
      return 'text-rose-400 bg-rose-950/25'
    }
    if (l.includes('WARN')) {
      return 'text-amber-400'
    }
    if (l.includes('INFO') || l.includes('SUCCESS') || l.includes('HTTP 200')) {
      return 'text-cyan-300'
    }
    return 'text-slate-300'
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Control Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>System Runtime Logs</span>
            </h2>
            <p className="text-xs font-mono text-slate-400">Live process streams &amp; telemetry inspector</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedFile}
            onChange={e => setSelectedFile(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {logFiles.map(f => (
              <option key={f.name} value={f.name}>
                {f.name} {f.size ? `(${Math.round(f.size / 1024)} KB)` : ''}
              </option>
            ))}
          </select>

          <select
            value={tailLines}
            onChange={e => setTailLines(parseInt(e.target.value) || 200)}
            className="px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {[100, 200, 500, 1000, 2000].map(n => (
              <option key={n} value={n}>{n} lines</option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Filter log entries..."
              className="w-44 pl-8 pr-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs font-mono text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-700 text-cyan-500"
            />
            <span>Auto (3s)</span>
          </label>

          <button
            onClick={loadContent}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="rounded-2xl bg-slate-950 border border-slate-800/90 shadow-2xl overflow-hidden flex flex-col font-mono text-xs">
        {/* Terminal Titlebar */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-[11px] text-slate-300 font-bold ml-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              {selectedFile || 'Select a log file'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {filteredLines.length} lines showing
          </span>
        </div>

        {/* Console Box */}
        <div className="p-4 overflow-y-auto max-h-[620px] space-y-0.5 select-text font-mono text-[11px] leading-relaxed">
          {!filteredLines.length ? (
            <div className="py-12 text-center text-slate-500 font-mono">
              {loading ? 'Reading log file...' : 'No log entries found.'}
            </div>
          ) : (
            filteredLines.map((l, i) => (
              <div key={i} className={`px-2 py-0.5 rounded ${getLineClass(l)} whitespace-pre-wrap break-all hover:bg-slate-900/60`}>
                {l}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
