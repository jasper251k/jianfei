import Dexie, { type EntityTable } from 'dexie'
import type { Profile } from './target'
import type { CloudMeal, CloudWeight, Member } from './cloud'

// date: YYYY-MM-DD（本地日期），一天一条晨起体重
export type Weight = { date: string; kg: number }

export type Nutr = { kcal: number; protein: number; carbs: number; fat: number }

// grams 是估算时按的重量；raw = 生重（肉类等），false = 熟重
export type Item = { name: string; grams?: number | null; raw?: boolean | null; nutr: Nutr }

export type Meal = {
  id: string
  owner: string // 现在都是 'me'；家人的记录在 familyMeals 表
  date: string
  time: string // HH:MM
  items: Item[]
  input?: string // 原话
  photo?: Blob // 压缩后的照片，只存在拍照的手机上
  note?: string // 豆包写的假设
  createdAt: number
}

// custom: 自己改过的每日目标；没有就按 profile 和最近体重算
// 加入家庭后 arkKey / model 用家庭共用的那份，profile / custom 也会同步到云端
export type Settings = { key: 'app'; arkKey: string; model: string; profile?: Profile; custom?: Nutr }

// 常吃的一餐存成套餐，说「还是套餐一」就照着记；加入家庭后同步到云端（只有自己能看到）
export type Combo = { id: string; name: string; items: Item[]; note?: string; createdAt: number }

// 我的食物：加工食品等，记住每 100 克的营养，以后估算按这个算；加入家庭后同步到云端（只有自己能看到）
export type Food = { id: string; name: string; per100: Nutr; createdAt: number }

// 还没传上云的改动：kind + 体重日期 / 饮食、套餐、食物的 id；deleted = 删掉了
export type Pending = { key: string; kind: 'weight' | 'meal' | 'combo' | 'food'; ref: string; deleted: boolean }

// 加入的家庭（只有一条）
export type FamilyInfo = { key: 'family'; familyId: string; code: string; memberId: string; members: Member[]; pulledAt?: number }

export const db = new Dexie('jianfei') as Dexie & {
  weights: EntityTable<Weight, 'date'>
  meals: EntityTable<Meal, 'id'>
  settings: EntityTable<Settings, 'key'>
  pending: EntityTable<Pending, 'key'>
  family: EntityTable<FamilyInfo, 'key'>
  familyWeights: EntityTable<CloudWeight & { key: string }, 'key'>
  familyMeals: EntityTable<CloudMeal, 'id'>
  combos: EntityTable<Combo, 'id'>
  foods: EntityTable<Food, 'id'>
}

db.version(1).stores({
  weights: 'date',
})
db.version(2).stores({
  weights: 'date',
  meals: 'id, date',
  settings: 'key',
})
db.version(3).stores({
  weights: 'date',
  meals: 'id, date',
  settings: 'key',
  pending: 'key',
  family: 'key',
  familyWeights: 'key, memberId',
  familyMeals: 'id, memberId, date',
})
db.version(4).stores({
  weights: 'date',
  meals: 'id, date',
  settings: 'key',
  pending: 'key',
  family: 'key',
  familyWeights: 'key, memberId',
  familyMeals: 'id, memberId, date',
  combos: 'id, createdAt',
})
db.version(5).stores({
  weights: 'date',
  meals: 'id, date',
  settings: 'key',
  pending: 'key',
  family: 'key',
  familyWeights: 'key, memberId',
  familyMeals: 'id, memberId, date',
  combos: 'id, createdAt',
  foods: 'id, createdAt',
})

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const ZERO: Nutr = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export const sumNutr = (items: { nutr: Nutr }[]): Nutr =>
  items.reduce(
    (s, i) => ({
      kcal: s.kcal + i.nutr.kcal,
      protein: s.protein + i.nutr.protein,
      carbs: s.carbs + i.nutr.carbs,
      fat: s.fat + i.nutr.fat,
    }),
    ZERO,
  )

// ---------- 改自己的记录：都走这里，顺便记下要上传 ----------

const mark = (kind: Pending['kind'], ref: string, deleted: boolean) =>
  db.pending.put({ key: `${kind}:${ref}`, kind, ref, deleted })

export async function putWeights(ws: Weight[]) {
  await db.transaction('rw', db.weights, db.pending, async () => {
    await db.weights.bulkPut(ws)
    for (const w of ws) await mark('weight', w.date, false)
  })
  kick()
}

export async function deleteWeight(date: string) {
  await db.transaction('rw', db.weights, db.pending, async () => {
    await db.weights.delete(date)
    await mark('weight', date, true)
  })
  kick()
}

export async function addMeal(m: Meal) {
  await db.transaction('rw', db.meals, db.pending, async () => {
    await db.meals.add(m)
    await mark('meal', m.id, false)
  })
  kick()
}

// 改已经记下的一餐：按 id 覆盖
export async function putMeal(m: Meal) {
  await db.transaction('rw', db.meals, db.pending, async () => {
    await db.meals.put(m)
    await mark('meal', m.id, false)
  })
  kick()
}

export async function deleteMeal(id: string) {
  await db.transaction('rw', db.meals, db.pending, async () => {
    await db.meals.delete(id)
    await mark('meal', id, true)
  })
  kick()
}

export async function putCombo(c: Combo) {
  await db.transaction('rw', db.combos, db.pending, async () => {
    await db.combos.put(c)
    await mark('combo', c.id, false)
  })
  kick()
}

export async function deleteCombo(id: string) {
  await db.transaction('rw', db.combos, db.pending, async () => {
    await db.combos.delete(id)
    await mark('combo', id, true)
  })
  kick()
}

export async function putFood(f: Food) {
  await db.transaction('rw', db.foods, db.pending, async () => {
    await db.foods.put(f)
    await mark('food', f.id, false)
  })
  kick()
}

export async function deleteFood(id: string) {
  await db.transaction('rw', db.foods, db.pending, async () => {
    await db.foods.delete(id)
    await mark('food', id, true)
  })
  kick()
}

// 有改动时通知同步模块（sync.ts 注册），避免循环引用
let onChange = () => {}
export const setOnChange = (fn: () => void) => (onChange = fn)
const kick = () => onChange()
