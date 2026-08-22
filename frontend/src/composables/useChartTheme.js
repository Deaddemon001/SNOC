import { useThemeStore } from '../stores/theme'

export function useChartTheme() {
  const theme = useThemeStore()
  return theme.chartTheme
}

export function baseChartOptions(ct, extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    ...extra,
    plugins: {
      legend: { display: false },
      ...(extra.plugins || {})
    },
    scales: {
      x: {
        grid: { color: ct.grid },
        ticks: { color: ct.tick, maxTicksLimit: 8, font: { size: 10, family: 'Share Tech Mono' } }
      },
      y: {
        grid: { color: ct.grid },
        ticks: { color: ct.tick, maxTicksLimit: 6, font: { size: 10, family: 'Share Tech Mono' } },
        beginAtZero: true
      }
    }
  }
}
