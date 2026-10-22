import type { Nutr } from '../db'

const MACROS: [keyof Nutr, string][] = [
  ['protein', '蛋白'],
  ['carbs', '碳水'],
  ['fat', '脂肪'],
]

// 今天的热量额度：一根大条看总热量，三根细条看三大营养素
export default function Budget({ eaten, target, hint = true }: { eaten: Nutr; target?: Nutr; hint?: boolean }) {
  if (!target)
    return (
      <>
        <div className="eaten">
          已吃 <b>{Math.round(eaten.kcal)}</b> 千卡
        </div>
        {hint && <p className="hint">去右上角设置里填身高、年龄和目标，就能算出每天能吃多少。</p>}
      </>
    )

  const left = Math.round(target.kcal - eaten.kcal)
  const over = left < 0

  return (
    <div className="budget">
      <div className="eaten">
        {over ? (
          <>
            超了 <b className="over">{-left}</b> 千卡
          </>
        ) : (
          <>
            还能吃 <b>{left}</b> 千卡
          </>
        )}
      </div>
      <Bar value={eaten.kcal} max={target.kcal} big />
      <div className="sub">
        已吃 {Math.round(eaten.kcal)} / 目标 {Math.round(target.kcal)} 千卡
      </div>
      <div className="macros">
        {MACROS.map(([k, label]) => (
          <div className="macrorow" key={k}>
            <span className="name">{label}</span>
            <Bar value={eaten[k]} max={target[k]} />
            <span className="num">
              {Math.round(eaten[k])}/{Math.round(target[k])}g
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Bar({ value, max, big }: { value: number; max: number; big?: boolean }) {
  const ratio = max > 0 ? value / max : 0
  return (
    <div
      className={`meter${big ? ' big' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemax={Math.round(max)}
    >
      <div className={`fill${ratio > 1 ? ' over' : ''}`} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
    </div>
  )
}
