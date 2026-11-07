import { db } from './db'
import { today } from './date'

// 用户一般每周减 0.4 kg，定目标时按这个给建议
export const WEEKLY_LOSS = 0.4

export const saveGoal = (sunday: string, kg: number) =>
  db.goals.put({ sunday, kg: Math.round(kg * 10) / 10, setOn: today() })

// 比目标高多少（按 0.1 kg 四舍五入后比）；≤ 0 就是达到了
export const overGoal = (value: number, target: number) => (Math.round(value * 10) - Math.round(target * 10)) / 10
