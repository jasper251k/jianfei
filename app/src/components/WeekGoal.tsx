import { useState } from 'react'
import type { Goal, Weight } from '../db'
import { addDays, md, sundayOf, today, weekday } from '../date'
import { avg7, fmtKg } from '../weights'
import { WEEKLY_LOSS, overGoal, saveGoal } from '../goals'
import Diff from './Diff'

// 和目标比：达到了绿色「✓ 达到」，没达到写差多少
export function Versus({ value, target }: { value: number; target: number }) {
  const over = overGoal(value, target)
  return over <= 0 ? <span className="goalok">✓ 达到</span> : <span className="goalmiss">差 {over.toFixed(1)}</span>
}

// 每周目标：周日定下周日的目标，到了周日看周日体重和 7 天平均有没有达到
export default function WeekGoal({ weights, goals }: { weights: Weight[]; goals: Goal[] }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState<string>()

  const now = today()
  const isSun = weekday(now) === 6
  const thisSun = sundayOf(now) // 周日当天就是今天
  // 周日定下周日的；平时（还没定的话）定本周日的
  const planSun = isSun ? addDays(thisSun, 7) : thisSun
  const cur = goals.find((g) => g.sunday === thisSun)
  const plan = goals.find((g) => g.sunday === planSun)

  const sunW = weights.find((w) => w.date === thisSun)
  const lastSunW = weights.find((w) => w.date === addDays(thisSun, -7))
  const curAvg = avg7(weights, now)

  // 建议 = 目标周日的前一个周日的 7 天平均 − 0.4；那天前后没记录，就用最近 7 天平均 / 最近一次体重
  const baseSun = addDays(planSun, -7)
  const latest = weights[weights.length - 1]
  let base = avg7(weights, baseSun)
  let baseLabel = `${md(baseSun)}（周日）的 7 天平均`
  if (base === undefined && curAvg !== undefined) [base, baseLabel] = [curAvg, '最近 7 天平均']
  if (base === undefined && latest) [base, baseLabel] = [latest.kg, '最近一次体重']
  const suggest = base !== undefined ? base - WEEKLY_LOSS : undefined

  const value = text ?? (plan ? fmtKg(plan.kg) : suggest !== undefined ? fmtKg(suggest) : '')
  const kg = Number(value)
  const valid = value.trim() !== '' && kg >= 30 && kg <= 200
  const step = (d: number) => {
    const from = valid ? kg : suggest
    if (from !== undefined) setText(fmtKg(from + d))
  }
  const close = () => {
    setEditing(false)
    setText(undefined)
  }
  const save = async () => {
    if (!valid) return
    await saveGoal(planSun, kg)
    close()
  }

  return (
    <>
      {cur && (
        <section className="card list goal">
          <div className="goalhead">
            <div className="label">本周目标 · {md(thisSun)}周日</div>
            {!isSun && !editing && (
              <button className="linkbtn" onClick={() => setEditing(true)}>
                改
              </button>
            )}
          </div>
          <div className="goalkg">
            {fmtKg(cur.kg)}
            <small> kg</small>
          </div>
          <div className="row">
            <span>周日体重</span>
            {sunW ? (
              <>
                <span className="num">{fmtKg(sunW.kg)}</span>
                <span className="goalcell">
                  <Versus value={sunW.kg} target={cur.kg} />
                </span>
              </>
            ) : (
              <span className="sub">{isSun ? '今天还没称' : '周日称了再看'}</span>
            )}
          </div>
          <div className="row">
            <span>{isSun ? '7 天平均' : '目前 7 天平均'}</span>
            {curAvg !== undefined ? (
              <>
                <span className="num">{fmtKg(curAvg)}</span>
                <span className="goalcell">
                  <Versus value={curAvg} target={cur.kg} />
                </span>
              </>
            ) : (
              <span className="sub">这 7 天没记</span>
            )}
          </div>
          {sunW && lastSunW && (
            <div className="row">
              <span>上周日（{md(lastSunW.date)}）</span>
              <span className="num">{fmtKg(lastSunW.kg)}</span>
              <span className="goalcell">
                <Diff value={sunW.kg - lastSunW.kg} />
              </span>
            </div>
          )}
        </section>
      )}

      {!plan || editing ? (
        <section className="card goal">
          <div className="goalhead">
            <div className="label">
              {isSun ? '定下周目标' : '定本周目标'} · {md(planSun)}周日
            </div>
            {editing && (
              <button className="linkbtn" onClick={close}>
                取消
              </button>
            )}
          </div>
          {base !== undefined && suggest !== undefined && (
            <p className="goaltip">
              {baseLabel} {fmtKg(base)} kg，按每周减 {WEEKLY_LOSS} kg，建议定 {fmtKg(suggest)} kg
            </p>
          )}
          <div className="goalinput">
            <button className="btn" onClick={() => step(-0.1)} aria-label="减 0.1">
              −
            </button>
            <input
              className="input"
              inputMode="decimal"
              placeholder="目标体重"
              value={value}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn" onClick={() => step(0.1)} aria-label="加 0.1">
              +
            </button>
            <button className="btn primary" disabled={!valid} onClick={save}>
              定下
            </button>
          </div>
        </section>
      ) : (
        isSun && (
          <section className="card list goal">
            <div className="row">
              <span>下周目标 · {md(planSun)}周日</span>
              <span className="num">{fmtKg(plan.kg)}</span>
              <button className="linkbtn" onClick={() => setEditing(true)}>
                改
              </button>
            </div>
          </section>
        )
      )}
    </>
  )
}
