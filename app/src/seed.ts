import { db, type Weight } from './db'

// 开始用 App 之前在 Codex 里记的体重
const SEED: Weight[] = [
  { date: '2026-10-09', kg: 85 },
  { date: '2026-10-10', kg: 84.7 },
  { date: '2026-10-11', kg: 84.6 },
  { date: '2026-10-14', kg: 85.3 },
  { date: '2026-10-16', kg: 84.4 },
  { date: '2026-10-17', kg: 83.3 },
  { date: '2026-10-18', kg: 83.5 },
  { date: '2026-10-19', kg: 84.3 },
]

// 只导入一次；已经手动粘贴过的日期不覆盖
export async function seedOnce() {
  try {
    if (localStorage.getItem('seeded')) return
  } catch {
    return
  }
  const have = new Set(await db.weights.toCollection().primaryKeys())
  await db.weights.bulkAdd(SEED.filter((w) => !have.has(w.date)))
  try {
    localStorage.setItem('seeded', '1')
  } catch {
    // 存不了标记也没关系，下次还会跳过已有日期
  }
}
