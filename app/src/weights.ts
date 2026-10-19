import { addDays, mondayOf, today, ymd } from './date'
import type { Weight } from './db'

// ---------- 识别输入 ----------

// 体重相关的口头前缀，去掉后剩下的才是日期和数字
const FILLER = /今早|早上|早晨|晨起|晨重|空腹|体重|称重|记录一下|记一下|记录|是|为|的/g

const NUM = String.raw`(\d{2,3}(?:\.\d{1,2})?)\s*(kg|KG|公斤|千克|斤)?`
const ONLY = new RegExp(`^${NUM}$`)
const REL = new RegExp(`^(今天|昨天|前天)\\s*${NUM}$`)
const DATED = new RegExp(String.raw`^(?:(\d{4})[年./-])?(\d{1,2})[月./-](\d{1,2})[日号]?\s*` + NUM + '$')

const toKg = (num: string, unit?: string) => {
  const n = Number(num)
  return unit === '斤' ? n / 2 : n
}

// 输入能整体读成体重时返回记录列表，否则返回 null（交给饮食记录处理）。
// 支持：「84.3」「今早空腹体重85.3。」「昨天 84.5」「10月9日 85」「10.9 85」，多行一起发就是批量补记。
export function parseWeights(text: string, now = today()): Weight[] | null {
  const lines = text
    .split(/[\n;；]+/)
    .map((l) =>
      l
        .replace(/^[^\d一-龥]+/, '') // 句首误打的符号
        .replace(FILLER, '')
        .replace(/[，,:：。\s]+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
  if (!lines.length) return null

  const out: Weight[] = []
  for (const line of lines) {
    let date = now
    let kg: number
    let m: RegExpMatchArray | null
    if ((m = line.match(ONLY))) {
      kg = toKg(m[1], m[2])
    } else if ((m = line.match(REL))) {
      date = addDays(now, m[1] === '昨天' ? -1 : m[1] === '前天' ? -2 : 0)
      kg = toKg(m[2], m[3])
    } else if ((m = line.match(DATED))) {
      const nowYear = Number(now.slice(0, 4))
      const d = new Date(m[1] ? Number(m[1]) : nowYear, Number(m[2]) - 1, Number(m[3]))
      if (d.getMonth() !== Number(m[2]) - 1) return null // 2 月 30 日之类
      date = ymd(d)
      // 没写年份又落在未来，就是去年
      if (!m[1] && date > now) date = ymd(new Date(nowYear - 1, d.getMonth(), d.getDate()))
      kg = toKg(m[4], m[5])
    } else {
      return null
    }
    if (!(kg >= 30 && kg <= 200)) return null
    out.push({ date, kg: Math.round(kg * 10) / 10 })
  }
  return out
}

// ---------- 统计 ----------

// sorted: 按日期升序。返回某天之前最近的一条记录
export function prevOf(sorted: Weight[], date: string) {
  let prev: Weight | undefined
  for (const w of sorted) {
    if (w.date >= date) break
    prev = w
  }
  return prev
}

// 截至某天（含）最近 7 个自然日内记录的平均值
export function avg7(sorted: Weight[], date: string) {
  const from = addDays(date, -6)
  const xs = sorted.filter((w) => w.date >= from && w.date <= date)
  return xs.length ? xs.reduce((s, w) => s + w.kg, 0) / xs.length : undefined
}

export type Week = { monday: string; avg: number; count: number; change?: number }

// 按周（周一开始）求平均；change 是与上一周平均的差（上一周没有记录就没有）
export function weekly(sorted: Weight[]): Week[] {
  const map = new Map<string, Weight[]>()
  for (const w of sorted) {
    const k = mondayOf(w.date)
    map.set(k, [...(map.get(k) ?? []), w])
  }
  const weeks = [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([monday, ws]) => ({ monday, avg: ws.reduce((s, w) => s + w.kg, 0) / ws.length, count: ws.length }) as Week)
  weeks.forEach((w, i) => {
    const last = weeks[i - 1]
    if (last && last.monday === addDays(w.monday, -7)) w.change = w.avg - last.avg
  })
  return weeks
}

export const fmtKg = (n: number) => n.toFixed(1)

export const fmtDiff = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(1)
