// 体重变化：降了绿色 ▼，涨了红色 ▲，不只靠颜色区分
export default function Diff({ value }: { value: number }) {
  const v = Math.round(value * 10) / 10
  if (v === 0) return <span className="diff flat">±0.0</span>
  return <span className={`diff ${v < 0 ? 'down' : 'up'}`}>{(v < 0 ? '▼' : '▲') + Math.abs(v).toFixed(1)}</span>
}
