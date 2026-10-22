import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Weight } from '../db'
import { addDays, daysBetween, md } from '../date'
import { avg7, fmtKg } from '../weights'

const H = 220
const PAD = { top: 12, right: 12, bottom: 24, left: 36 }

// 每日体重（灰点）+ 7 天平均（蓝线）。手指按住或滑动看某一天的数值
export default function WeightChart({ weights, from, to }: { weights: Weight[]; from: string; to: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number>()

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pts = weights
    .filter((w) => w.date >= from && w.date <= to)
    .map((w) => ({ ...w, avg: avg7(weights, w.date)! }))

  const span = Math.max(1, daysBetween(from, to))
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = H - PAD.top - PAD.bottom
  const x = (date: string) => PAD.left + (daysBetween(from, date) / span) * plotW

  // 纵轴：上下各留一点，至少 2 kg 的范围，刻度取整
  const vals = pts.flatMap((p) => [p.kg, p.avg])
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi - lo < 2) {
    const mid = (hi + lo) / 2
    lo = mid - 1
    hi = mid + 1
  }
  const step = hi - lo <= 3 ? 0.5 : hi - lo <= 8 ? 1 : 2
  lo = Math.floor((lo - step * 0.3) / step) * step
  hi = Math.ceil((hi + step * 0.3) / step) * step
  const y = (kg: number) => PAD.top + ((hi - kg) / (hi - lo)) * plotH
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10)

  // 横轴标 3～4 个日期
  // 横轴标 3～4 个日期，天数少时去掉重复的
  const xTicks = [...new Set([0, 1 / 3, 2 / 3, 1].map((f) => addDays(from, Math.round(span * f))))]

  const avgPath = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join('')

  const pick = (clientX: number) => {
    const el = box.current
    if (!el || !pts.length) return
    const px = clientX - el.getBoundingClientRect().left
    let best = 0
    pts.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(pts[best].date) - px)) best = i
    })
    setHover(best)
  }

  const h = hover !== undefined ? pts[hover] : undefined

  if (!pts.length) return <p className="hint">这段时间没有记录，换个范围看看。</p>

  return (
    <div className="chart">
      <div className="legend">
        <span>
          <i className="dot" />
          每日体重
        </span>
        <span>
          <i className="line" />7 天平均
        </span>
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
                <line className="gridline"x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
                <text className="tick" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
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
            {h && <line className="cross" x1={x(h.date)} x2={x(h.date)} y1={PAD.top} y2={H - PAD.bottom} />}
            {pts.map((p) => (
              <circle key={p.date} className="daily" cx={x(p.date)} cy={y(p.kg)} r={4} />
            ))}
            <path className="avg" d={avgPath} />
            {h && (
              <>
                <circle className="daily on" cx={x(h.date)} cy={y(h.kg)} r={5} />
                <circle className="avgdot" cx={x(h.date)} cy={y(h.avg)} r={4} />
              </>
            )}
          </svg>
        )}
        {h && (
          <div className="tip" style={tipPos(x(h.date), width)}>
            <b>{md(h.date)}</b>
            <span>体重 {fmtKg(h.kg)} kg</span>
            <span>7 天平均 {fmtKg(h.avg)} kg</span>
          </div>
        )}
      </div>
    </div>
  )
}

// 提示框放在十字线旁边，靠右时翻到左边
function tipPos(cx: number, width: number): CSSProperties {
  return cx > width / 2 ? { right: width - cx + 8, top: 4 } : { left: cx + 8, top: 4 }
}
