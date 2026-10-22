import { db, newId, putFood, type Food, type Nutr } from './db'

const key = (name: string) => name.replace(/\s+/g, '')
const KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const

// 已经记住了、数也一样
export const known = (foods: Food[], name: string, per100: Nutr) =>
  foods.some((f) => key(f.name) === key(name) && KEYS.every((k) => f.per100[k] === per100[k]))

// 记住一样食物；同名的就更新成新的数
export async function rememberFood(name: string, per100: Nutr) {
  const old = (await db.foods.toArray()).find((f) => key(f.name) === key(name))
  await putFood(old ? { ...old, per100 } : { id: newId(), name, per100, createdAt: Date.now() })
}
