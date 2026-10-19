import { useEffect, useRef, useState } from 'react'
import { db, type Weight } from '../db'
import { addDays, md, today } from '../date'
import { avg7, fmtDiff, fmtKg, parseWeights, prevOf } from '../weights'
import Diff from '../components/Diff'

export default function Today({ weights }: { weights: Weight[] }) {
  const [text, setText] = useState('')
  const [toast, setToast] = useState('')
  const timer = useRef(0)
  const area = useRef<HTMLTextAreaElement>(null)

  const now = today()
  const mine = weights.find((w) => w.date === now)
  const prev = prevOf(weights, now)
  const avg = avg7(weights, now)
  // 「比上周」= 今天的 7 天平均 − 7 天前那天的 7 天平均
  const lastWeekAvg = avg7(weights, addDays(now, -7))
  const recent = weights.slice(-7).reverse()

  const say = (msg: string) => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(''), 3000)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // 输入框随内容长高
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [text])

  const send = async () => {
    const t = text.trim()
    if (!t) return
    const ws = parseWeights(t, now)
    if (!ws) {
      say('目前只认体重数字，记饮食要等后面几步做好')
      return
    }
    const old = await db.weights.bulkGet(ws.map((w) => w.date))
    await db.weights.bulkPut(ws)
    setText('')
    if (ws.length === 1) {
      const w = ws[0]
      const o = old[0]
      const day = w.date === now ? '今天' : md(w.date)
      say(o && o.kg !== w.kg ? `${day}改为 ${fmtKg(w.kg)} kg（原来 ${fmtKg(o.kg)}）` : `已记下${day} ${fmtKg(w.kg)} kg`)
    } else {
      say(`已记下 ${ws.length} 天的体重`)
    }
  }

  return (
    <div className="today">
      <header className="pagehead">
        <h1>今天</h1>
        <span className="sub">{md(now)}</span>
      </header>

      <section className="card hero">
        <div className="label">晨起体重</div>
        {mine ? (
          <div className="big">
            {fmtKg(mine.kg)}
            <small> kg</small>
          </div>
        ) : (
          <div className="big empty">还没记</div>
        )}
        <div className="facts">
          {mine && prev && (
            <span>
              比 {md(prev.date)} <Diff value={mine.kg - prev.kg} />
            </span>
          )}
          {avg !== undefined && (
            <span>
              7 天平均 {fmtKg(avg)}
              {lastWeekAvg !== undefined && <> · 比上周 {fmtDiff(avg - lastWeekAvg)}</>}
            </span>
          )}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="card list">
          <div className="label">最近记录</div>
          {recent.map((w) => {
            const p = prevOf(weights, w.date)
            return (
              <div className="row" key={w.date}>
                <span>{md(w.date)}</span>
                <span className="num">{fmtKg(w.kg)}</span>
                <span className="diffcell">{p && <Diff value={w.kg - p.kg} />}</span>
              </div>
            )
          })}
        </section>
      )}

      <p className="hint">
        发一个数字就记成今天的体重，比如「84.3」。
        <br />
        补记以前的：「昨天 84.5」「10月9日 85」，多行一起发就是批量补记。
      </p>

      {toast && <div className="toast">{toast}</div>}

      <div className="composer">
        <textarea
          ref={area}
          className="input"
          rows={1}
          value={text}
          placeholder="体重，或者吃了什么"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="send" disabled={!text.trim()} onClick={send}>
          发送
        </button>
      </div>
    </div>
  )
}
