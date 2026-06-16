import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js'
import { fmt, monthLabel, closedMonths } from '../utils/storage'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function History({ state }) {
  const months = closedMonths(state)

  if (!months.length) {
    return <p className="empty">Нет записей</p>
  }

  const incData = months.map((mk) =>
    Object.values(state.entries[mk].income || {}).reduce((s, v) => s + (+v || 0), 0)
  )
  const spData = months.map((mk, i) => {
    if (!i) return 0
    const e = state.entries[mk]
    const p = state.entries[months[i - 1]]
    const bal = Object.values(e.balances || {}).reduce((s, v) => s + (+v || 0), 0)
    const inc = Object.values(e.income || {}).reduce((s, v) => s + (+v || 0), 0)
    const pb = Object.values(p.balances || {}).reduce((s, v) => s + (+v || 0), 0)
    return Math.max(0, Math.round(inc - (bal - pb)))
  })

  const labels = months.map((m) => monthLabel(m).split(' ')[0])

  return (
    <div>
      <div className="card">
        <div className="section-title">История по месяцам</div>
        {months
          .slice()
          .reverse()
          .map((mk, i, arr) => {
            const e = state.entries[mk]
            const prev = state.entries[arr[i + 1]]
            const bal = Object.values(e.balances || {}).reduce((s, v) => s + (+v || 0), 0)
            const inc = Object.values(e.income || {}).reduce((s, v) => s + (+v || 0), 0)
            let spStr = '—'
            if (prev) {
              const pb = Object.values(prev.balances || {}).reduce((s, v) => s + (+v || 0), 0)
              spStr = fmt(Math.max(0, Math.round(inc - (bal - pb))))
            }
            return (
              <div className="history-row" key={mk}>
                <span className="bold">{monthLabel(mk)}</span>
                <span className="muted small">доход {fmt(inc)} · расход {spStr}</span>
              </div>
            )
          })}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-title">Динамика</div>
        <div style={{ position: 'relative', height: 220 }}>
          <Bar
            data={{
              labels,
              datasets: [
                {
                  label: 'Доход',
                  data: incData,
                  backgroundColor: 'rgba(29,158,117,.25)',
                  borderColor: '#1D9E75',
                  borderWidth: 1.5,
                },
                {
                  label: 'Расходы',
                  data: spData,
                  backgroundColor: 'rgba(216,90,48,.2)',
                  borderColor: '#D85A30',
                  borderWidth: 1.5,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { autoSkip: false, maxRotation: 45, font: { size: 11 } }, grid: { display: false } },
                y: { ticks: { callback: (v) => fmt(v), font: { size: 11 } }, grid: { color: 'rgba(128,128,128,.1)' } },
              },
            }}
          />
        </div>
      </div>
    </div>
  )
}
