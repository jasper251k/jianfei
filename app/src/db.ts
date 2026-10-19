import Dexie, { type EntityTable } from 'dexie'
import type { Profile } from './target'

// date: YYYY-MM-DD（本地日期），一天一条晨起体重
export type Weight = { date: string; kg: number }

export type Nutr = { kcal: number; protein: number; carbs: number; fat: number }

// grams 是估算时按的重量；raw = 生重（肉类等），false = 熟重
export type Item = { name: string; grams?: number; raw?: boolean; nutr: Nutr }

export type Meal = {
  id: string
  owner: string // 以后家庭版区分是谁的记录，现在都是 'me'
  date: string
  time: string // HH:MM
  items: Item[]
  input?: string // 原话
  photo?: Blob // 压缩后的照片
  note?: string // 豆包写的假设
  createdAt: number
}

// custom: 自己改过的每日目标；没有就按 profile 和最近体重算
export type Settings = { key: 'app'; arkKey: string; model: string; profile?: Profile; custom?: Nutr }

export const db = new Dexie('jianfei') as Dexie & {
  weights: EntityTable<Weight, 'date'>
  meals: EntityTable<Meal, 'id'>
  settings: EntityTable<Settings, 'key'>
}

db.version(1).stores({
  weights: 'date',
})
db.version(2).stores({
  weights: 'date',
  meals: 'id, date',
  settings: 'key',
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
