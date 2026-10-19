import type { Item, Settings } from './db'
import { toDataUrl } from './photos'

const URL_ = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

const SYSTEM = `你是营养估算助手，帮用户记录减脂饮食。用户会发一张饭菜照片、一段文字，或两者都有。
请把这一餐拆成几样食物，估算每样的重量和营养，只输出 JSON，不要任何其他文字：
{"items":[{"name":"米饭","grams":200,"raw":false,"kcal":232,"protein":5.2,"carbs":51,"fat":0.6}],"note":"假设说明"}

规则：
- 用户文字里给的信息（重量、做法、用油、品牌、吃了多少）优先于照片判断。
- 没给重量就按照片里的份量或常见一份估算。
- raw 表示 grams 是生重（true）还是熟重（false）；肉类、米饭特别要分清。
- 烹调用油单独列一项（name 写「烹调油」），按做法估；水煮、清蒸没加油就不列。
- kcal 取整数，protein、carbs、fat 单位是克，保留一位小数。
- note 用一两句中文写出最影响准确度的假设，比如「牛肉按生重 150g、炒菜按 10g 油估」，方便用户纠正。
- 如果用户在纠正上一次的结果，就在上一次的基础上改，没提到的保持不变。
- 看不出是食物或信息不够，items 返回空数组，在 note 里说明需要补充什么。`

export type Estimate = { items: Item[]; note: string; raw: string }

// 一轮对话：第一轮是照片 / 原话，之后每轮是用户的纠正
export type Turn = { text?: string; photo?: Blob; answer?: string }

export async function estimate(settings: Settings, turns: Turn[]): Promise<Estimate> {
  if (!settings.arkKey || !settings.model) throw new Error('先在设置里填豆包的 Key 和模型 ID')

  const messages: unknown[] = [{ role: 'system', content: SYSTEM }]
  for (const t of turns) {
    const content: unknown[] = []
    if (t.photo) content.push({ type: 'image_url', image_url: { url: await toDataUrl(t.photo) } })
    content.push({ type: 'text', text: t.text?.trim() || '请估算照片里这一餐。' })
    messages.push({ role: 'user', content })
    if (t.answer) messages.push({ role: 'assistant', content: t.answer })
  }

  let res: Response
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.arkKey.trim()}` },
      body: JSON.stringify({
        model: settings.model.trim(),
        messages,
        temperature: 0.2,
        thinking: { type: 'disabled' }, // 不需要深度思考，省时间也省钱
      }),
    })
  } catch {
    throw new Error('连不上豆包，检查一下网络')
  }
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 401) throw new Error('豆包 Key 不对，去设置里检查')
    if (res.status === 404 || /model/i.test(body)) throw new Error('模型 ID 不对或没开通，去设置里检查')
    throw new Error(`豆包出错了（${res.status}）：${body.slice(0, 120)}`)
  }
  const data = await res.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''
  return { ...parse(raw), raw }
}

function parse(raw: string): { items: Item[]; note: string } {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('豆包的回复看不懂，再试一次')
  let obj: { items?: unknown[]; note?: unknown }
  try {
    obj = JSON.parse(m[0])
  } catch {
    throw new Error('豆包的回复看不懂，再试一次')
  }
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0)
  const items: Item[] = (obj.items ?? []).map((x) => {
    const i = x as Record<string, unknown>
    return {
      name: String(i.name ?? '未知'),
      grams: i.grams === undefined ? undefined : n(i.grams),
      raw: typeof i.raw === 'boolean' ? i.raw : undefined,
      nutr: { kcal: Math.round(n(i.kcal)), protein: n(i.protein), carbs: n(i.carbs), fat: n(i.fat) },
    }
  })
  return { items, note: String(obj.note ?? '') }
}
