import type { Nutr, Settings } from './db'

export type Sex = 'male' | 'female'

export type Profile = {
  sex: Sex
  age: number
  heightCm: number
  activity: number // ACTIVITY 的下标
  goal: number // GOALS 的下标
}

export const ACTIVITY = [
  { label: '久坐，基本不运动', k: 1.2 },
  { label: '每周运动 1～3 次', k: 1.375 },
  { label: '每周运动 3～5 次', k: 1.55 },
  { label: '每周运动 6～7 次', k: 1.725 },
  { label: '体力活 + 天天高强度训练', k: 1.9 },
]

// delta: 每天比总消耗少吃 / 多吃多少千卡
export const GOALS = [
  { label: '慢慢减（每周约 0.3 kg）', delta: -300 },
  { label: '正常减（每周约 0.5 kg）', delta: -500 },
  { label: '快点减（每周约 0.7 kg）', delta: -750 },
  { label: '保持体重', delta: 0 },
  { label: '增肌', delta: 250 },
]

// Mifflin-St Jeor 公式
export const bmr = (p: Profile, kg: number) => 10 * kg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161)

export function recommend(p: Profile, kg: number) {
  const b = bmr(p, kg)
  const tdee = b * ACTIVITY[p.activity].k
  // 再低就容易掉肌肉、扛不住，不低于基础代谢
  const kcal = Math.round(Math.max(b, tdee + GOALS[p.goal].delta) / 10) * 10
  const cutting = GOALS[p.goal].delta < 0
  // 蛋白质：减脂 1.8 g/kg、其他 1.6 g/kg；脂肪 0.7 g/kg；剩下的给碳水
  const protein = Math.round(kg * (cutting ? 1.8 : 1.6))
  const fat = Math.round(kg * 0.7)
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { bmr: Math.round(b), tdee: Math.round(tdee), target: { kcal, protein, carbs, fat } as Nutr }
}

// 今天的目标：自己改过的优先，否则按最近一次体重算，都没有就是 undefined
export function dailyTarget(s: Settings | undefined, latestKg: number | undefined): Nutr | undefined {
  if (s?.custom) return s.custom
  if (s?.profile && latestKg) return recommend(s.profile, latestKg).target
}
