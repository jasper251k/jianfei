import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { startSync } from './sync'
import Today from './pages/Today'
import Calendar from './pages/Calendar'
import Trend from './pages/Trend'
import Family from './pages/Family'
import Join from './pages/Join'
import Settings from './pages/Settings'

type Tab = 'today' | 'calendar' | 'trend' | 'family'

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'calendar', label: '日历' },
  { key: 'trend', label: '趋势' },
  { key: 'family', label: '家人' },
]

// 邀请链接 ?join=家庭码
const joinCode = () => new URLSearchParams(location.search).get('join')?.toUpperCase() ?? ''

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [showSettings, setShowSettings] = useState(false)
  const [join, setJoin] = useState(joinCode)
  // 按日期升序；undefined = 还在读库
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray())
  // undefined = 还在读库，null = 还没设置过
  const settings = useLiveQuery(async () => (await db.settings.get('app')) ?? null)
  const family = useLiveQuery(async () => (await db.family.get('family')) ?? null)

  useEffect(() => {
    navigator.storage?.persist?.()
    startSync()
  }, [])

  if (!weights || settings === undefined || family === undefined) return null

  const doneJoin = () => {
    setJoin('')
    history.replaceState(null, '', location.pathname)
    setTab('family')
  }

  // 已经在这个家庭里了，邀请链接直接忽略
  if (join && family?.code !== join)
    return (
      <div className="app">
        <main className="screen">
          <Join code={join} onDone={doneJoin} />
        </main>
      </div>
    )

  if (showSettings)
    return (
      <div className="app">
        <main className="screen">
          <Settings
            settings={settings ?? undefined}
            latestKg={weights[weights.length - 1]?.kg}
            inFamily={!!family}
            onClose={() => setShowSettings(false)}
          />
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
        {tab === 'family' && <Family family={family ?? undefined} weights={weights} settings={settings ?? undefined} />}
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
