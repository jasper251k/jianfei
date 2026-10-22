import { addMeal, db, newId, putCombo, type Combo, type Item } from './db'
import { hm, today } from './date'

const CN = '零一二三四五六七八九'

// 1～99 写成中文：1 → 一，12 → 十二，20 → 二十
const cn = (n: number) => {
  if (n < 10) return CN[n]
  const t = Math.floor(n / 10)
  return (t > 1 ? CN[t] : '') + '十' + (n % 10 ? CN[n % 10] : '')
}

// 「套餐1」「套餐 一」都认成「套餐一」
const norm = (s: string) => s.replace(/\s+/g, '').replace(/\d{1,2}/g, (d) => cn(Number(d)))

// 去掉名字后剩下这些就当没别的要求，直接照套餐记
const FILLER =
  /我|还是|照旧|老样子|一样|今天|今日|早上|中午|下午|晚上|早饭|午饭|晚饭|早餐|午餐|晚餐|下午茶|就行|就好|吃|了|的|呢|吧|啊|嗯|一份|一顿|[，,。.！!？?、~～…]/g

// 话里提到了哪个套餐；rest = 去掉名字和口头语后还剩的要求（比如「饭少一半」）
export function matchCombo(text: string, combos: Combo[]) {
  const t = norm(text)
  // 长名字先比，免得「套餐十一」被「套餐一」截走
  for (const c of [...combos].sort((a, b) => b.name.length - a.name.length)) {
    const n = norm(c.name)
    const i = n ? t.indexOf(n) : -1
    if (i < 0) continue
    return { combo: c, rest: (t.slice(0, i) + t.slice(i + n.length)).replace(FILLER, '') }
  }
}

// 下一个没用过的名字：套餐一、套餐二……
export async function nextName() {
  const names = new Set((await db.combos.toArray()).map((c) => norm(c.name)))
  for (let n = 1; ; n++) if (!names.has('套餐' + cn(n))) return '套餐' + cn(n)
}

export async function saveCombo(name: string, items: Item[], note?: string) {
  const all = await db.combos.toArray()
  if (all.some((c) => norm(c.name) === norm(name))) throw new Error(`已经有叫「${name}」的套餐了`)
  await putCombo({ id: newId(), name, items, note, createdAt: Date.now() })
}

// 照套餐记一餐
export const recordCombo = (c: Combo, input: string) =>
  addMeal({ id: newId(), owner: 'me', date: today(), time: hm(), items: c.items, input, note: c.note, createdAt: Date.now() })

// 在套餐基础上让豆包改：把套餐当成豆包上一次的回答
export const comboAnswer = (c: Combo) =>
  JSON.stringify({
    items: c.items.map((i) => ({ name: i.name, grams: i.grams, raw: i.raw, ...i.nutr })),
    note: c.note ?? '',
  })
