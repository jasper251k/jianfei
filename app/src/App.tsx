import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { seedOnce } from './seed'
import Today from './pages/Today'
import Calendar from './pages/Calendar'
import Trend from './pages/Trend'

type Tab = 'today' | 'calendar' | 'trend'

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'calendar', label: '日历' },
  { key: 'trend', label: '趋势' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  // 按日期升序；undefined = 还在读库
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray())

  useEffect(() => {
    navigator.storage?.persist?.()
    seedOnce()
  }, [])

  if (!weights) return null

  return (
    <div className="app">
      <main className="screen">
        {tab === 'today' && <Today weights={weights} />}
        {tab === 'calendar' && <Calendar weights={weights} />}
        {tab === 'trend' && <Trend weights={weights} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
