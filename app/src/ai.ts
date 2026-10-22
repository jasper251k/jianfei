import type { Food, Item, Nutr, Settings } from './db'
import { toDataUrl } from './photos'

const URL_ = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

const SYSTEM = `你是营养估算助手，帮用户记录减脂饮食。用户会发一张饭菜照片、一段文字，或两者都有。
请把这一餐拆成几样食物，估算每样的重量和营养，只输出 JSON，不要任何其他文字：
{"items":[{"name":"米饭","grams":200,"raw":false,"kcal":232,"protein":5.2,"carbs":51,"fat":0.6}],"note":"假设说明","day":0,"time":"","per100":[]}

规则：
- 用户文字里给的信息（重量、热量、做法、用油、品牌、吃了多少）优先于照片判断，用户给的数不要改。
- 没给重量就按照片里的份量或常见一份估算。
- raw 表示 grams 是生重（true）还是熟重（false）；肉类、米饭特别要分清。
- 烹调用油单独列一项（name 写「烹调油」），按做法估；水煮、清蒸没加油就不列。
- kcal 取整数，protein、carbs、fat 单位是克，保留一位小数。
- 用户只说了大概热量也要照记，比如「早饭大概 800 卡」：列一项，name 写他说的那一餐或食物（如「早饭」），grams 填 null，kcal 用他说的数；蛋白、碳水、脂肪按他提到的食物估，没提食物就按普通一餐估（约蛋白 15%、碳水 50%、脂肪 35% 的热量），并在 note 里说明。
- day 是这一餐哪天吃的：今天 0，昨天 -1，前天 -2；没说就是 0。
- time 是这一餐大概几点吃的，格式 HH:MM：用户说了钟点就用他说的；只说早上 / 中午 / 下午 / 晚上 / 夜宵，就分别填 08:00 / 12:00 / 15:30 / 18:30 / 21:30；没提时间就填空字符串。
- note 用一两句中文写出最影响准确度的假设，比如「牛肉按生重 150g、炒菜按 10g 油估」，方便用户纠正。
- 如果用户在纠正上一次的结果，就在上一次的基础上改，没提到的保持不变。
- 用户说了某样食物每 100 克的营养，或照片里能看清营养成分表时，按这个数算这样食物，并把它放进 per100：[{"name":"酵母蛋白粉","kcal":370,"protein":80,"carbs":5,"fat":3,"remember":false}]（都是每 100 克的数；用户按一份 / 一勺说的、成分表按每份写的，都换算成每 100 克）；其他时候 per100 是空数组。
- 用户要你记住某样食物（「记住这个」「以后都吃这款」「记一下这个蛋白粉」），就把它放进 per100 并把 remember 设为 true：有用户给的数或成分表就用它，都没有就按这类食物常见的数估，在 note 里说明是估的。name 用用户的叫法，简短，不加「这款」之类的字。
- 用户发来「我记住的食物」清单时，提到清单里的食物（名字相近也算）就按清单里每 100 克的数乘以重量算，不要自己估；没说吃了多少克就按常见一份估克数，在 note 里说明。用户说清单里的数不对、给了新数，就按新数算，放进 per100 并把 remember 设为 true。
- 用户只是要你记住食物、没说这一餐吃了，items 返回空数组，note 写「已记住 XX」。
- 照片里不是食物，或者既没说吃了什么、也没说热量时，items 返回空数组，在 note 里说明需要补充什么。`

// day：0 今天、-1 昨天……；time：HH:MM，没提就是空字符串
// per100：这次用户报的、或成分表上的每 100 克营养；remember = 用户说了「记住」，自动存
export type Per100 = { name: string; per100: Nutr; remember: boolean }
export type Estimate = { items: Item[]; note: string; day: number; time: string; per100: Per100[]; raw: string }

// 一轮对话：第一轮是照片 / 原话，之后每轮是用户的纠正
export type Turn = { text?: string; photo?: Blob; answer?: string }

// 我记住的食物写成一段话，跟规则一起发给豆包
const foodList = (foods: Food[]) =>
  '我记住的食物（每 100 克）：\n' +
  foods
    .map((f) => `${f.name}：${Math.round(f.per100.kcal)} 千卡，蛋白 ${f.per100.protein}g，碳水 ${f.per100.carbs}g，脂肪 ${f.per100.fat}g`)
    .join('\n')

export async function estimate(settings: Settings, turns: Turn[], foods: Food[] = []): Promise<Estimate> {
  if (!settings.arkKey || !settings.model) throw new Error('先在设置里填豆包的 Key 和模型 ID')

  const messages: unknown[] = [{ role: 'system', content: foods.length ? SYSTEM + '\n\n' + foodList(foods) : SYSTEM }]
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

function parse(raw: string): Omit<Estimate, 'raw'> {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('豆包的回复看不懂，再试一次')
  let obj: { items?: unknown[]; note?: unknown; day?: unknown; time?: unknown; per100?: unknown }
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
  const day = Math.round(n(obj.day))
  const time = typeof obj.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(obj.time) ? obj.time : ''
  const per100: Per100[] = (Array.isArray(obj.per100) ? obj.per100 : [])
    .map((x) => {
      const i = x as Record<string, unknown>
      return {
        name: String(i.name ?? '').trim().slice(0, 20),
        per100: { kcal: Math.round(n(i.kcal)), protein: n(i.protein), carbs: n(i.carbs), fat: n(i.fat) },
        remember: i.remember === true,
      }
    })
    .filter((f) => f.name && f.per100.kcal > 0 && f.per100.kcal <= 900) // 每 100 克最多 900 千卡（纯油）
  return { items, note: String(obj.note ?? ''), day: day <= 0 && day >= -6 ? day : 0, time, per100 }
}
