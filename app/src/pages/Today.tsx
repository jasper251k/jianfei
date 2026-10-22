import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, putWeights, sumNutr, type Settings, type Weight } from '../db'
import { addDays, md, today } from '../date'
import { avg7, fmtDiff, fmtKg, parseWeights, prevOf } from '../weights'
import { compress, useBlobUrl } from '../photos'
import { dailyTarget } from '../target'
import type { Turn } from '../ai'
import { comboAnswer, matchCombo, recordCombo } from '../combos'
import { deleteCombo, type Combo } from '../db'
import Budget from '../components/Budget'
import Diff from '../components/Diff'
import MealCard from '../components/MealCard'
import MealDraft from '../components/MealDraft'

export default function Today({
  weights,
  settings,
  onOpenSettings,
}: {
  weights: Weight[]
  settings?: Settings
  onOpenSettings: () => void
}) {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<Blob>()
  const [draft, setDraft] = useState<{ first: Turn; before?: Turn[] }>()
  const [toast, setToast] = useState('')
  const [editCombos, setEditCombos] = useState(false)
  const timer = useRef(0)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoUrl = useBlobUrl(photo)

  const now = today()
  // 按吃饭的钟点排，补记的早饭排在前面
  const meals = useLiveQuery(() => db.meals.where('date').equals(now).sortBy('time'), [now]) ?? []
  const combos = useLiveQuery(() => db.combos.orderBy('createdAt').toArray()) ?? []
  const eaten = sumNutr(meals.flatMap((m) => m.items))
  const mine = weights.find((w) => w.date === now)
  const prev = prevOf(weights, now)
  const avg = avg7(weights, now)
  // 「比上周」= 今天的 7 天平均 − 7 天前那天的 7 天平均
  const lastWeekAvg = avg7(weights, addDays(now, -7))

  const say = (msg: string) => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(''), 3000)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // 输入框随内容长高
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [text])

  const pickPhoto = async (f?: File) => {
    if (!f) return
    try {
      setPhoto(await compress(f))
    } catch (e) {
      say((e as Error).message)
    }
  }

  const send = async () => {
    const t = text.trim()
    if (!t && !photo) return
    const ws = !photo && parseWeights(t, now)
    if (!ws) {
      // 说的是套餐：没别的要求就直接记，不花豆包的钱
      const hit = !photo ? matchCombo(t, combos) : undefined
      if (hit && !hit.rest) {
        await eatCombo(hit.combo, t)
        return
      }
      // 不是体重就当一餐，交给豆包
      if (!settings?.arkKey || !settings.model) {
        say('先在右上角设置里填豆包的 Key 和模型 ID')
        return
      }
      // 套餐 + 一句要求（如「还是套餐一，饭少一半」）：在套餐基础上让豆包改
      setDraft(
        hit
          ? { first: { text: t }, before: [{ text: `我吃了「${hit.combo.name}」`, answer: comboAnswer(hit.combo) }] }
          : { first: { text: t, photo } },
      )
      return
    }
    const old = await db.weights.bulkGet(ws.map((w) => w.date))
    await putWeights(ws)
    setText('')
    if (ws.length === 1) {
      const w = ws[0]
      const o = old[0]
      const day = w.date === now ? '今天' : md(w.date)
      say(o && o.kg !== w.kg ? `${day}改为 ${fmtKg(w.kg)} kg（原来 ${fmtKg(o.kg)}）` : `已记下${day} ${fmtKg(w.kg)} kg`)
    } else {
      say(`已记下 ${ws.length} 天的体重`)
    }
  }

  const eatCombo = async (c: Combo, input: string) => {
    await recordCombo(c, input)
    setText('')
    say(`已照「${c.name}」记下 ${Math.round(sumNutr(c.items).kcal)} 千卡`)
  }

  const removeCombo = (c: Combo) => {
    if (confirm(`删掉套餐「${c.name}」？已经记下的饭不受影响。`)) deleteCombo(c.id)
  }

  const draftDone = (saved: boolean) => {
    setDraft(undefined)
    if (saved) {
      setText('')
      setPhoto(undefined)
      say('已记下这一餐')
    }
  }

  return (
    <div className="today">
      <header className="pagehead">
        <h1>今天</h1>
        <span className="sub">{md(now)}</span>
        <span className="spacer" />
        <button className="gear" onClick={onOpenSettings} aria-label="设置">
          设置
        </button>
      </header>

      <section className="card hero">
        <div className="label">晨起体重</div>
        {mine ? (
          <div className="big">
            {fmtKg(mine.kg)}
            <small> kg</small>
          </div>
        ) : (
          <div className="big empty">还没记</div>
        )}
        <div className="facts">
          {mine && prev && (
            <span>
              比 {md(prev.date)} <Diff value={mine.kg - prev.kg} />
            </span>
          )}
          {avg !== undefined && (
            <span>
              7 天平均 {fmtKg(avg)}
              {lastWeekAvg !== undefined && <> · 比上周 {fmtDiff(avg - lastWeekAvg)}</>}
            </span>
          )}
        </div>
      </section>

      <section className="card">
        <div className="label">今天吃的</div>
        <Budget eaten={eaten} target={dailyTarget(settings, weights[weights.length - 1]?.kg)} />
        {meals.length > 0 && (
          <div className="meals">
            {meals.map((m) => (
              <MealCard key={m.id} meal={m} onSaid={say} />
            ))}
          </div>
        )}
      </section>

      <p className="hint">
        发数字记体重，比如「84.3」；补记：「昨天 84.5」「10月9日 85」。
        <br />
        拍照或说吃了什么，豆包估热量，比如「两百克生牛肉、一碗紫米饭、一勺橄榄油」。
        <br />
        {combos.length
          ? '常吃的直接说「还是套餐一」；有变化就加一句，如「还是套餐一，饭少一半」。'
          : '常吃的一餐：记下后点开它，点「存成套餐」，以后说「还是套餐一」就行。'}
      </p>

      {toast && <div className="toast">{toast}</div>}

      <div className="composer">
        {combos.length > 0 && (
          <div className={`combos${editCombos ? ' editing' : ''}`}>
            {combos.map((c) => (
              <button key={c.id} onClick={() => (editCombos ? removeCombo(c) : eatCombo(c, c.name))}>
                <b>{c.name}</b>
                <span>{Math.round(sumNutr(c.items).kcal)}</span>
              </button>
            ))}
            <button className="combosedit" onClick={() => setEditCombos(!editCombos)}>
              {editCombos ? '完成' : '删套餐'}
            </button>
          </div>
        )}
        {photoUrl && (
          <div className="picked">
            <img src={photoUrl} alt="" />
            <button onClick={() => setPhoto(undefined)} aria-label="去掉照片">
              ×
            </button>
          </div>
        )}
        <div className="bar">
          <button className="cam" onClick={() => fileInput.current?.click()} aria-label="拍照">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M4 8h3l2-3h6l2 3h3v11H4z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              pickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <textarea
            ref={area}
            className="input"
            rows={1}
            value={text}
            placeholder={photo ? '补充一句（可不填），如「饭吃了一半」' : '体重，或者吃了什么'}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="send" disabled={!text.trim() && !photo} onClick={send}>
            发送
          </button>
        </div>
      </div>

      {draft && <MealDraft settings={settings} first={draft.first} before={draft.before} onDone={draftDone} />}
    </div>
  )
}
