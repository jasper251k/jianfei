import { useEffect, useState } from 'react'
import { cloud, type Who } from './cloud'
import { db, setOnChange, type FamilyInfo } from './db'
import { addDays, today } from './date'

// 同步：自己的改动先存手机（pending 表），联网后上传；家人的数据定期整份拉下来。
// 没加入家庭时什么都不做，App 和以前一样只存手机。

let running = false
let again = false
let status: { syncing: boolean; error: string } = { syncing: false, error: '' }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

export function useSyncStatus() {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((n) => n + 1)
    listeners.add(f)
    return () => {
      listeners.delete(f)
    }
  }, [])
  return status
}

// 把云端返回的家庭信息存到手机；家庭的豆包设置覆盖到本机设置
export async function saveWho(who: Who) {
  if (!who.family || !who.memberId) {
    await db.family.clear()
    await db.familyWeights.clear()
    await db.familyMeals.clear()
    return
  }
  const old = await db.family.get('family')
  const info: FamilyInfo = {
    key: 'family',
    familyId: who.family.familyId,
    code: who.family.code,
    memberId: who.memberId,
    members: who.members ?? [],
    pulledAt: old?.pulledAt,
  }
  await db.family.put(info)
  const s = await db.settings.get('app')
  const mine = info.members.find((m) => m.memberId === info.memberId)
  await db.settings.put({
    key: 'app',
    arkKey: who.family.arkKey || s?.arkKey || '',
    model: who.family.model || s?.model || '',
    profile: mine?.profile ?? s?.profile,
    custom: mine?.custom ?? undefined,
  })
}

async function upload() {
  const pend = await db.pending.toArray()
  if (!pend.length) return
  const weights = []
  const deletedWeights: string[] = []
  const meals = []
  const deletedMeals: string[] = []
  for (const p of pend) {
    if (p.kind === 'weight') {
      const w = !p.deleted && (await db.weights.get(p.ref))
      if (w) weights.push({ date: w.date, kg: w.kg })
      else deletedWeights.push(p.ref)
    } else {
      const m = !p.deleted && (await db.meals.get(p.ref))
      if (m) meals.push({ id: m.id, date: m.date, time: m.time, items: m.items, input: m.input, note: m.note, createdAt: m.createdAt })
      else deletedMeals.push(p.ref)
    }
  }
  // 分批传，一次别太大
  for (let i = 0; i < Math.max(weights.length, meals.length, deletedWeights.length, deletedMeals.length); i += 200) {
    await cloud.push({
      weights: weights.slice(i, i + 200),
      deletedWeights: deletedWeights.slice(i, i + 200),
      meals: meals.slice(i, i + 200),
      deletedMeals: deletedMeals.slice(i, i + 200),
    })
  }
  // 上传期间又有新改动的不删，下次再传
  await db.transaction('rw', db.pending, async () => {
    for (const p of pend) {
      const now = await db.pending.get(p.key)
      if (now && now.deleted === p.deleted) await db.pending.delete(p.key)
    }
  })
}

async function download() {
  const fam = await db.family.get('family')
  if (!fam) return
  const r = await cloud.pull(addDays(today(), -60))
  await saveWho(r)
  if (!r.family || !r.memberId) return
  const others = (x: { memberId: string }) => x.memberId !== r.memberId
  const mine = (x: { memberId: string }) => x.memberId === r.memberId
  await db.transaction('rw', [db.familyWeights, db.familyMeals, db.family, db.weights, db.meals, db.pending], async () => {
    await db.familyWeights.clear()
    await db.familyWeights.bulkPut(r.weights.filter(others).map((w) => ({ ...w, key: `${w.memberId}:${w.date}` })))
    await db.familyMeals.clear()
    await db.familyMeals.bulkPut(r.meals.filter(others))
    await db.family.update('family', { pulledAt: Date.now() })
    // 换手机接回：云端有、手机上没有的自己的记录补回来；手机上已有的、刚删还没传的都不动
    const pend = new Set(await db.pending.toCollection().primaryKeys())
    for (const w of r.weights.filter(mine))
      if (!pend.has(`weight:${w.date}`) && !(await db.weights.get(w.date))) await db.weights.add({ date: w.date, kg: w.kg })
    for (const { memberId: _, ...m } of r.meals.filter(mine))
      if (!pend.has(`meal:${m.id}`) && !(await db.meals.get(m.id))) await db.meals.add({ ...m, owner: 'me' })
  })
}

export async function syncNow() {
  if (!(await db.family.get('family'))) return
  if (running) {
    again = true
    return
  }
  running = true
  status = { syncing: true, error: status.error }
  emit()
  try {
    do {
      again = false
      await upload()
      await download()
    } while (again)
    status = { syncing: false, error: '' }
  } catch (e) {
    status = { syncing: false, error: (e as Error).message }
  } finally {
    running = false
    emit()
  }
}

// 第一次创建 / 加入家庭时，把手机上已有的记录全部标成待上传
export async function markAllPending() {
  const [ws, ms] = await Promise.all([db.weights.toArray(), db.meals.toArray()])
  await db.pending.bulkPut([
    ...ws.map((w) => ({ key: `weight:${w.date}`, kind: 'weight' as const, ref: w.date, deleted: false })),
    ...ms.map((m) => ({ key: `meal:${m.id}`, kind: 'meal' as const, ref: m.id, deleted: false })),
  ])
}

let timer = 0
export function startSync() {
  setOnChange(() => {
    clearTimeout(timer)
    timer = window.setTimeout(syncNow, 800)
  })
  syncNow()
  window.addEventListener('online', () => syncNow())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
  window.setInterval(() => document.visibilityState === 'visible' && syncNow(), 5 * 60 * 1000)
}
