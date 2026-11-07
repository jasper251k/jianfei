import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Weight } from '../db'
import { addDays, md, today } from '../date'
import { fmtKg, weekly } from '../weights'
import Diff from '../components/Diff'
import WeightChart from '../components/WeightChart'
import WeekGoal, { Versus } from '../components/WeekGoal'

const RANGES = [
  { label: '30 天', days: 30 },
  { label: '90 天', days: 90 },
  { label: '全部', days: 0 },
]

export default function Trend({ weights }: { weights: Weight[] }) {
  const [days, setDays] = useState(30)
  const now = today()
  const from = days ? addDays(now, -(days - 1)) : (weights[0]?.date ?? now)
  const weeks = weekly(weights).reverse()
  const goals = useLiveQuery(() => db.goals.toArray())

  return (
    <div className="trend">
      <header className="pagehead">
        <h1>趋势</h1>
      </header>

      {goals && <WeekGoal weights={weights} goals={goals} />}

      <div className="seg">
        {RANGES.map((r) => (
          <button key={r.days} className={days === r.days ? 'on' : ''} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>

      <section className="card">
        {weights.length < 2 ? (
          <p className="hint">记满两天就能看到折线图。</p>
        ) : (
          <WeightChart weights={weights} from={from} to={now} />
        )}
      </section>

      {weeks.length > 0 && (
        <section className="card list">
          <div className="label">每周平均（周一到周日）</div>
          {weeks.map((w) => {
            // 那周日的目标：周日过了（含当天）才判断达没达到
            const sun = addDays(w.monday, 6)
            const goal = goals?.find((g) => g.sunday === sun)
            return (
              <div className="row" key={w.monday}>
                <span>
                  {md(w.monday)}那周
                  {goal && (
                    <span className="goaltag">
                      目标 {fmtKg(goal.kg)}
                      {sun <= now && (
                        <>
                          {' · '}
                          <Versus value={w.avg} target={goal.kg} />
                        </>
                      )}
                    </span>
                  )}
                </span>
                <span className="num">{fmtKg(w.avg)}</span>
                <span className="sub">记 {w.count} 天</span>
                <span className="diffcell">{w.change !== undefined && <Diff value={w.change} />}</span>
              </div>
            )
          })}
        </section>
      )}

      <p className="hint">每天的体重会因为喝水、吃盐上下跳，看 7 天平均线和每周平均更准。</p>
    </div>
  )
}
