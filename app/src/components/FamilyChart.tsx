import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Weight } from '../db'
import { addDays, daysBetween, md, today } from '../date'
import { avg7, fmtDiff } from '../weights'

export type Line = { name: string; color: string; weights: Weight[] }

const H = 220
const PAD = { top: 12, right: 44, bottom: 24, left: 36 }

// 全家体重对比：每人画「7 天平均 − 第一次记录」，大家体重基数不同也能比。
// 线末端直接写名字，按住看那天每人变化了多少
export default function FamilyChart({ lines, days }: { lines: Line[]; days: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<string>()

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const to = today()
  // 从最早有记录的那天画起，数据少时线不会挤在最右边
  const first = lines.flatMap((l) => l.weights.map((w) => w.date)).sort()[0] ?? to
  const rangeStart = days ? addDays(to, -(days - 1)) : first
  const from = first > rangeStart ? (first === to ? addDays(to, -1) : first) : rangeStart
  const series = lines
    .filter((l) => l.weights.length)
    .map((l) => {
      const base = l.weights[0].kg
      const pts = l.weights
        .filter((w) => w.date >= from)
        .map((w) => ({ date: w.date, v: avg7(l.weights, w.date)! - base }))
      return { ...l, pts }
    })
    .filter((s) => s.pts.length)

  if (!series.length) return <p className="hint">这段时间没有记录。</p>

  const span = Math.max(1, daysBetween(from, to))
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = H - PAD.top - PAD.bottom
  const x = (date: string) => PAD.left + (daysBetween(from, date) / span) * plotW

  const vals = [0, ...series.flatMap((s) => s.pts.map((p) => p.v))]
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi - lo < 2) {
    const mid = (hi + lo) / 2
    lo = mid - 1
    hi = mid + 1
  }
  const step = hi - lo <= 3 ? 0.5 : hi - lo <= 8 ? 1 : 2
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * plotH
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10)
  // 横轴标 3～4 个日期，天数少时去掉重复的
  const xTicks = [...new Set([0, 1 / 3, 2 / 3, 1].map((f) => addDays(from, Math.round(span * f))))]

  // 名字标签按末端高度排开，至少隔 14px，避免重叠
  const labels = series
    .map((s) => ({ name: s.name, y: y(s.pts[s.pts.length - 1].v), x: x(s.pts[s.pts.length - 1].date) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14)

  const pick = (clientX: number) => {
    const el = box.current
    if (!el) return
    const px = clientX - el.getBoundingClientRect().left
    const d = Math.round(((px - PAD.left) / plotW) * span)
    setHover(addDays(from, Math.max(0, Math.min(span, d))))
  }

  // 某天每人的值：那天没称就用之前最近一次
  const valueAt = (pts: { date: string; v: number }[], date: string) => {
    let v: number | undefined
    for (const p of pts) {
      if (p.date > date) break
      v = p.v
    }
    return v
  }

  return (
    <div className="chart">
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i className="line" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div
        ref={box}
        className="plot"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(undefined)}
      >
        {width > 0 && (
          <svg width={width} height={H}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  className={t === 0 ? 'zeroline' : 'gridline'}
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                />
                <text className="tick" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
                  {t > 0 ? '+' : ''}
                  {t % 1 ? t.toFixed(1) : t}
                </text>
              </g>
            ))}
            {xTicks.map((d, i) => (
              <text
                key={d}
                className="tick"
                x={x(d)}
                y={H - 6}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
              >
                {Number(d.slice(5, 7))}/{Number(d.slice(8))}
              </text>
            ))}
            {hover && <line className="cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} />}
            {series.map((s) => (
              <path
                key={s.name}
                className="famline"
                stroke={s.color}
                d={s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}
              />
            ))}
            {series.map((s) => {
              const p = s.pts[s.pts.length - 1]
              return <circle key={s.name} className="enddot" cx={x(p.date)} cy={y(p.v)} r={4} fill={s.color} />
            })}
            {labels.map((l) => (
              <text key={l.name} className="endlabel" x={l.x + 6} y={l.y + 4}>
                {/* 右边只留了 44px，长名字只写前两个字，颜色能认出是谁 */}
                {[...l.name].length > 3 ? [...l.name].slice(0, 2).join('') : l.name}
              </text>
            ))}
          </svg>
        )}
        {hover && (
          <div className="tip" style={tipPos(x(hover), width)}>
            <b>{md(hover)}</b>
            {series.map((s) => {
              const v = valueAt(s.pts, hover)
              return (
                <span key={s.name}>
                  <i className="dot" style={{ background: s.color }} />
                  {s.name} {v === undefined ? '—' : `${fmtDiff(v)} kg`}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function tipPos(cx: number, width: number): CSSProperties {
  return cx > width / 2 ? { right: width - cx + 8, top: 4 } : { left: cx + 8, top: 4 }
}
