import Dexie, { type EntityTable } from 'dexie'

// date: YYYY-MM-DD（本地日期），一天一条晨起体重
export type Weight = { date: string; kg: number }

export const db = new Dexie('jianfei') as Dexie & {
  weights: EntityTable<Weight, 'date'>
}

db.version(1).stores({
  weights: 'date',
})
