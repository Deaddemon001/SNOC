import React, { useState, useRef } from 'react'
import {
  Cpu,
  HardDrive,
  Activity,
  Globe,
  Clock,
  RotateCw,
  Power,
  ShieldCheck,
  AlertTriangle,
  Server,
  Layers,
  Database,
  Radio,
  FileText,
  Zap,
  Bell
} from 'lucide-react'
import { Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'
import { apiFetch, apiPost } from '../api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { usePolling } from '../hooks/usePolling'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)

interface HealthDashboardViewProps {
  onOpenRestart: (target: string) => void
  onOpenShutdown: () => void
}

export const HealthDashboardView: React.FC<HealthDashboardViewProps> = ({ onOpenRestart, onOpenShutdown }) => {
  const { isAdmin } = useAuth()
  const { theme } = useTheme()

  const [data, setData] = useState<any>(null)
  const historyRef = useRef<{ labels: string[]; cpu: number[]; ram: number[]; netInKbps: number[]; netOutKbps: number[] }>({
    labels: [],
    cpu: [],
    ram: [],
    netInKbps: [],
    netOutKbps: []
  })

  const loadData = async () => {
    try {
      const res = await apiFetch('/api/system/health_detailed')
      setData(res)

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      const h = historyRef.current
      h.labels.push(timeStr)
      h.cpu.push(res?.process?.cpu_percent ?? 0)
      h.ram.push(res?.process?.memory_rss_mb ?? 0)
      h.netInKbps.push((res?.network?.net_in_rate_kb ?? 0) * 8)
      h.netOutKbps.push((res?.network?.net_out_rate_kb ?? 0) * 8)

      if (h.labels.length > 30) {
        h.labels.shift()
        h.cpu.shift()
        h.ram.shift()
        h.netInKbps.shift()
        h.netOutKbps.shift()
      }
    } catch (_) {}
  }

  usePolling(loadData, 5000)

  const handleRestartService = async (key: string) => {
    if (!confirm(`Restart background service "${key.toUpperCase()}"?`)) return
    try {
      await apiPost('/api/system/service_action', { action: 'restart', service: key })
      loadData()
    } catch (e: any) {
      alert('Restart failed: ' + e.message)
    }
  }

  // Diagnostics
  const overallStatus = (data?.overall_status || 'optimal').toLowerCase()
  const isOptimal = overallStatus === 'optimal'
  const isWarning = overallStatus === 'warning'

  const diagBadgeText = isOptimal ? 'OPTIMAL HEALTH' : isWarning ? 'ATTENTION REQUIRED' : 'ACTION REQUIRED'
  const diagBadgeColor = isOptimal
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : isWarning
    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'

  const sys = data?.system || {}
  const proc = data?.process || {}
  const disk = data?.disk || {}
  const net = data?.network || {}
  const diag = data?.diagnostic || {}

  // KPIs
  const appCpu = proc.cpu_percent ?? 0
  const sysCpu = sys.cpu_percent ?? 0
  const appRamMb = proc.memory_rss_mb ?? 0
  const sysRamUsedMb = sys.memory_used_mb ?? 0
  const sysRamTotalMb = sys.memory_total_mb ?? 1
  const sysRamPct = sys.memory_percent ?? 0
  const diskFreeGb = disk.drive_free_gb ?? 0
  const diskFreeMb = Math.round(diskFreeGb * 1024)
  const diskFreePct = disk.drive_percent_free ?? 0
  const appStorageMb = disk.app_total_mb ?? 0
  const netInRate = net.net_in_rate_kb ?? 0
  const netOutRate = net.net_out_rate_kb ?? 0
  const netTotalRate = netInRate + netOutRate
  const uptimeFmt = data?.uptime?.formatted || '0m'
  const pid = proc.pid || '-'
  const threads = proc.threads_count || 0

  // Chart theme
  const isDark = theme === 'dark'
  const tickColor = isDark ? '#64748b' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'

  // Trend Chart
  const trendData = {
    labels: [...historyRef.current.labels],
    datasets: [
      {
        label: 'App CPU %',
        yAxisID: 'y',
        data: [...historyRef.current.cpu],
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      },
      {
        label: 'App RAM (MB)',
        yAxisID: 'y1',
        data: [...historyRef.current.ram],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.06)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      }
    ]
  }

  const trendOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { labels: { color: tickColor, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(1)}${ctx.datasetIndex === 0 ? '%' : ' MB'}`
        }
      }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 8, font: { size: 9, family: 'Share Tech Mono' } } },
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        grid: { color: gridColor },
        ticks: { color: '#00e5ff', font: { size: 9, family: 'Share Tech Mono' }, callback: (v: any) => v + '%' },
        beginAtZero: true,
        max: 100
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        ticks: { color: '#f59e0b', font: { size: 9, family: 'Share Tech Mono' }, callback: (v: any) => v + ' MB' },
        beginAtZero: true
      }
    }
  }

  // Memory Chart
  const otherRamMb = Math.max(0, sysRamUsedMb - appRamMb)
  const freeRamMb = Math.max(0, sys.memory_available_mb ?? (sysRamTotalMb - sysRamUsedMb))

  const memoryDoughnutData = {
    labels: ['Smart NOC App RSS', 'Other Processes', 'Free System Memory'],
    datasets: [
      {
        data: [Math.round(appRamMb), Math.round(otherRamMb), Math.round(freeRamMb)],
        backgroundColor: ['#00e5ff', '#f97316', '#10b981'],
        borderWidth: 1,
        borderColor: '#020617'
      }
    ]
  }

  const doughnutMbOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    cutout: '62%',
    plugins: {
      legend: { position: 'right' as const, labels: { color: tickColor, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.raw !== undefined ? Number(ctx.raw).toLocaleString() : '0'
            return ` ${ctx.label}: ${val} MB`
          }
        }
      }
    }
  }

  // Storage Chart
  const storageDoughnutData = {
    labels: ['PostgreSQL Database', 'TFTP Backups', 'Data directory', 'Logs', 'Free Disk Space'],
    datasets: [
      {
        data: [
          disk.postgres_db_mb ?? 0,
          disk.backups_size_mb ?? 0,
          disk.data_size_mb ?? 0,
          disk.logs_size_mb ?? 0,
          diskFreeMb
        ],
        backgroundColor: ['#00e5ff', '#10b981', '#f59e0b', '#8b5cf6', '#0284c7'],
        borderWidth: 1,
        borderColor: '#020617'
      }
    ]
  }

  // Network Chart
  const netData = {
    labels: [...historyRef.current.labels],
    datasets: [
      {
        label: 'Inbound RX (Kbps)',
        data: [...historyRef.current.netInKbps],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      },
      {
        label: 'Outbound TX (Kbps)',
        data: [...historyRef.current.netOutKbps],
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      }
    ]
  }

  const netOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { labels: { color: tickColor, font: { size: 10, family: 'Share Tech Mono' }, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(1)} Kbps`
        }
      }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 8, font: { size: 9, family: 'Share Tech Mono' } } },
      y: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 9, family: 'Share Tech Mono' }, callback: (v: any) => v + ' Kbps' },
        beginAtZero: true
      }
    }
  }

  const services = data?.services ? Object.values(data.services) : []
  const activeServices = services.filter((s: any) => s.running).length
  const counts = data?.counts || {}

  return (
    <div className="space-y-6">
      {/* ── DIAGNOSTIC HERO BANNER ───────────────────────────────────── */}
      <div className={`p-5 sm:p-6 rounded-2xl border transition-all ${
        isOptimal
          ? 'bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/30 border-emerald-500/20'
          : isWarning
          ? 'bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/30 border-amber-500/20'
          : 'bg-gradient-to-r from-slate-900 via-slate-900/90 to-rose-950/30 border-rose-500/20'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border tracking-wider flex items-center gap-1.5 ${diagBadgeColor}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOptimal ? 'bg-emerald-400' : isWarning ? 'bg-amber-400' : 'bg-rose-400'} animate-pulse`} />
                {diagBadgeText}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Host: {sys.hostname || 'Local'} ({sys.os || 'Windows'}) &bull; Python {proc.python_version || '3.x'} &bull; {sys.cpu_count || 4} Cores
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-wide text-slate-100">
              System &amp; Application Status Overview
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              <strong className="text-cyan-400">{diag.headline || 'System Optimal'}</strong> &mdash;{' '}
              {diag.verdict || 'Analyzing Smart NOC background services, processes, and database connectivity...'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {isAdmin && (
              <>
                <button
                  onClick={() => onOpenRestart('all')}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Restart Smart NOC
                </button>
                <button
                  onClick={onOpenShutdown}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Power className="w-3.5 h-3.5" /> Shutdown
                </button>
              </>
            )}
            <button
              onClick={() => loadData()}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" /> Health Check
            </button>
          </div>
        </div>
      </div>

      {/* ── 5 METRIC KPI CARDS ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* CPU */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>CPU Load</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {appCpu.toFixed(1)}%
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(2, appCpu))}%` }} />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>App CPU</span>
            <span>System: {sysCpu.toFixed(1)}%</span>
          </div>
        </div>

        {/* Memory */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>Memory Usage</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {appRamMb.toFixed(1)} MB
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.min(100, (appRamMb / sysRamTotalMb) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>App RSS</span>
            <span>System: {sysRamUsedMb.toFixed(0)} MB / {sysRamTotalMb.toFixed(0)} MB ({sysRamPct.toFixed(0)}%)</span>
          </div>
        </div>

        {/* Storage */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>Disk Storage</span>
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {diskFreeMb.toLocaleString()} MB free
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(2, diskFreePct))}%` }} />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>{diskFreePct.toFixed(0)}% drive free</span>
            <span>App Storage: {appStorageMb.toFixed(1)} MB</span>
          </div>
        </div>

        {/* Network */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>Network Throughput</span>
            <Globe className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {(netTotalRate * 8).toFixed(1)} Kbps
          </div>
          <div className="flex h-1.5 rounded-full bg-slate-800 overflow-hidden gap-0.5">
            <div className="bg-emerald-400" style={{ flex: Math.max(1, netInRate) }} />
            <div className="bg-orange-400" style={{ flex: Math.max(1, netOutRate) }} />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span className="text-emerald-400">RX {(netInRate * 8).toFixed(1)}</span>
            <span className="text-orange-400">TX {(netOutRate * 8).toFixed(1)} Kbps</span>
          </div>
        </div>

        {/* Uptime */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>24/7 Operations</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {uptimeFmt}
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-cyan-400 rounded-full w-full" />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>PID {pid}</span>
            <span>{threads} threads</span>
          </div>
        </div>
      </div>

      {/* ── 4 STUDIO CHARTS GRID ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU & RAM Trend */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              CPU &amp; RAM Trend
            </h3>
            <span className="text-[10px] font-mono text-slate-500">Live 5s Polling</span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <Line data={trendData} options={trendOpts} />
          </div>
        </div>

        {/* Memory Allocation (3-way) */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              System Memory Allocation
            </h3>
            <span className="text-[10px] font-mono text-slate-500">3-Way Split (MB)</span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <Doughnut data={memoryDoughnutData} options={doughnutMbOpts} />
          </div>
        </div>

        {/* Storage Distribution (5-way) */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              Storage &amp; Database Distribution
            </h3>
            <span className="text-[10px] font-mono text-slate-500">5-Way Split (MB)</span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <Doughnut data={storageDoughnutData} options={doughnutMbOpts} />
          </div>
        </div>

        {/* Network Throughput */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              Network Throughput Traffic Rate
            </h3>
            <span className="text-[10px] font-mono text-slate-500">Kbps Rate</span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <Line data={netData} options={netOpts} />
          </div>
        </div>
      </div>

      {/* ── BACKGROUND SERVICES MATRIX ───────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold tracking-wide text-slate-100">
              Background Services &amp; Processes Matrix
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-mono font-bold ${activeServices === services.length && services.length > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {activeServices} of {services.length} Services Active
            </span>
            <button
              onClick={() => loadData()}
              className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 border border-slate-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 px-4">Service / Component</th>
                <th className="py-3 px-4">Script &amp; Protocol</th>
                <th className="py-3 px-4">Port(s)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">PID</th>
                <th className="py-3 px-4 text-right">Memory</th>
                <th className="py-3 px-4 text-right">CPU %</th>
                <th className="py-3 px-4">Uptime</th>
                <th className="py-3 px-4">Heartbeat (5m)</th>
                {isAdmin && <th className="py-3 px-4 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {services.map((s: any) => (
                <tr key={s.key} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-sans font-bold text-slate-200">{s.name}</td>
                  <td className="py-3 px-4 text-slate-400">{s.script}</td>
                  <td className="py-3 px-4 text-cyan-400">{s.ports}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        s.running
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {s.running ? 'HEALTHY' : 'STOPPED'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">{s.pids?.join(', ') || '-'}</td>
                  <td className="py-3 px-4 text-right text-slate-200">{s.memory_rss_mb ? `${s.memory_rss_mb.toFixed(1)} MB` : '-'}</td>
                  <td className="py-3 px-4 text-right text-emerald-400">{s.cpu_percent !== undefined && s.running ? `${s.cpu_percent.toFixed(1)}%` : '-'}</td>
                  <td className="py-3 px-4 text-slate-400">{s.uptime_formatted || (s.running ? 'Active' : '-')}</td>
                  <td className="py-3 px-4 text-slate-400">{s.last_heartbeat_ago || '-'}</td>
                  {isAdmin && (
                    <td className="py-3 px-4 text-center">
                      {s.key === 'postgres' ? (
                        <span className="text-[10px] text-slate-500">System DB</span>
                      ) : (
                        <button
                          onClick={() => handleRestartService(s.key)}
                          title="Restart Service"
                          className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all text-[11px]"
                        >
                          Restart
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── QUICK INVENTORY COUNTERS ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Traps Ingested</div>
          <div className="text-lg font-bold font-mono text-cyan-400">{counts.traps?.toLocaleString() ?? '-'}</div>
          <div className="text-[10px] text-slate-500">SNMP receiver</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Syslog Messages</div>
          <div className="text-lg font-bold font-mono text-emerald-400">{counts.syslog?.toLocaleString() ?? '-'}</div>
          <div className="text-[10px] text-slate-500">device events</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Monitored Sites</div>
          <div className="text-lg font-bold font-mono text-amber-400">{counts.ping_targets?.toLocaleString() ?? '-'}</div>
          <div className="text-[10px] text-slate-500">ping targets</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">TFTP Backups</div>
          <div className="text-lg font-bold font-mono text-orange-400">{(counts.tftp_backups ?? counts.tftp)?.toLocaleString() ?? '-'}</div>
          <div className="text-[10px] text-slate-500">stored backups</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">OLT Profiles</div>
          <div className="text-lg font-bold font-mono text-purple-400">{(counts.olt_profiles ?? counts.olt)?.toLocaleString() ?? '-'}</div>
          <div className="text-[10px] text-slate-500">configured OLTs</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono uppercase text-slate-500">Alert Rules</div>
          <div className="text-lg font-bold font-mono text-rose-400">{(counts.alert_rules ?? counts.alerts)?.toLocaleString() ?? '-'}</div>
          <div className="text-[10px] text-slate-500">active rules</div>
        </div>
      </div>
    </div>
  )
}
