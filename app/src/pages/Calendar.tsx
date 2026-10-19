import { useState } from 'react'
import { db, type Weight } from '../db'
import { addDays, md, today, weekday, ymd } from '../date'
import { fmtKg, prevOf } from '../weights'
import Diff from '../components/Diff'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

export default function Calendar({ weights }: { weights: Weight[] }) {
  const now = today()
  const [month, setMonth] = useState(now.slice(0, 7)) // YYYY-MM
  const [editing, setEditing] = useState<string>()

  const byDate = new Map(weights.map((w) => [w.date, w]))
  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = [
    ...Array<null>(weekday(first)).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ]

  const shiftMonth = (n: number) => setMonth(ymd(new Date(y, m - 1 + n, 1)).slice(0, 7))
  const inMonth = weights.filter((w) => w.date.startsWith(month))
  const monthAvg = inMonth.length ? inMonth.reduce((s, w) => s + w.kg, 0) / inMonth.length : undefined

  return (
    <div className="calendar">
      <header className="pagehead">
        <button className="arrow" onClick={() => shiftMonth(-1)} aria-label="上个月">
          ‹
        </button>
        <h1>
          {y}年{m}月
        </h1>
        <button className="arrow" onClick={() => shiftMonth(1)} disabled={month >= now.slice(0, 7)} aria-label="下个月">
          ›
        </button>
      </header>

      <div className="card">
        <div className="grid head">
          {WEEK.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid">
          {cells.map((date, i) => {
            if (!date) return <span key={i} />
            const w = byDate.get(date)
            const p = w && prevOf(weights, date)
            return (
              <button
                key={date}
                className={`cell${date === now ? ' now' : ''}`}
                disabled={date > now}
                onClick={() => setEditing(date)}
              >
                <span className="d">{Number(date.slice(8))}</span>
                {w && <span className="kg">{fmtKg(w.kg)}</span>}
                {w && p && <Diff value={w.kg - p.kg} />}
              </button>
            )
          })}
        </div>
      </div>

      <p className="hint">
        {monthAvg !== undefined ? `本月记了 ${inMonth.length} 天，平均 ${fmtKg(monthAvg)} kg。` : '本月还没有记录。'}
        点某一天可以补记或修改。
      </p>

      {editing && <EditSheet date={editing} weight={byDate.get(editing)} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function EditSheet({ date, weight, onClose }: { date: string; weight?: Weight; onClose: () => void }) {
  const [val, setVal] = useState(weight ? fmtKg(weight.kg) : '')
  const kg = Number(val)
  const ok = val.trim() !== '' && kg >= 30 && kg <= 200

  const save = async () => {
    await db.weights.put({ date, kg: Math.round(kg * 10) / 10 })
    onClose()
  }
  const remove = async () => {
    await db.weights.delete(date)
    onClose()
  }

  return (
    <div className="mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{md(date)} 晨起体重</h2>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step="0.1"
          autoFocus
          value={val}
          placeholder="kg"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && save()}
        />
        <div className="actions">
          {weight && (
            <button className="btn danger" onClick={remove}>
              删除
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" disabled={!ok} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
