import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { seedOnce } from './seed'
import Today from './pages/Today'
import Calendar from './pages/Calendar'
import Trend from './pages/Trend'
import Settings from './pages/Settings'

type Tab = 'today' | 'calendar' | 'trend'

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'calendar', label: '日历' },
  { key: 'trend', label: '趋势' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [showSettings, setShowSettings] = useState(false)
  // 按日期升序；undefined = 还在读库
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray())
  // undefined = 还在读库，null = 还没设置过
  const settings = useLiveQuery(async () => (await db.settings.get('app')) ?? null)

  useEffect(() => {
    navigator.storage?.persist?.()
    seedOnce()
  }, [])

  if (!weights || settings === undefined) return null

  if (showSettings)
    return (
      <div className="app">
        <main className="screen">
          <Settings settings={settings ?? undefined} onClose={() => setShowSettings(false)} />
        </main>
      </div>
    )

  return (
    <div className="app">
      <main className="screen">
        {tab === 'today' && (
          <Today weights={weights} settings={settings ?? undefined} onOpenSettings={() => setShowSettings(true)} />
        )}
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
