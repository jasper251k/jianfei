import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addMeal, db, newId, putMeal, sumNutr, ZERO, type Item, type Meal, type Nutr, type Settings } from '../db'
import { asAnswer, estimate, type Per100, type Turn } from '../ai'
import { known, rememberFood } from '../foods'
import { addDays, hm, md, today } from '../date'
import { useBlobUrl } from '../photos'
import { fmtNutr } from '../nutr'

// 豆包估算结果：先确认、可修改、可回一句话重新算，点「记录」才存
// before：在套餐基础上改时，先放一轮「套餐 + 它的明细」当豆包上一次的回答
// onDone 带上这次记住的食物，今天页弹大提示；只说「记住」没吃东西时，记住后直接关掉
// meal：改已经记下的一餐，先填上原来的；第一轮是原来那一餐（带着答案），保存时覆盖原来那条
export default function MealDraft({
  settings,
  first,
  before = [],
  meal,
  onDone,
}: {
  settings?: Settings
  first: Turn
  before?: Turn[]
  meal?: Meal
  onDone: (saved: boolean, remembered: Per100[]) => void
}) {
  const [turns, setTurns] = useState<Turn[]>([...before, first])
  const [items, setItems] = useState<Item[]>(meal?.items ?? [])
  const [note, setNote] = useState(meal?.note ?? '')
  // 豆包从话里听出的日期和钟点（「早上忘记记了」→ 今天 08:00）
  const [day, setDay] = useState(0)
  const [time, setTime] = useState(meal?.time ?? '')
  // 这次报的每 100 克营养，可以记住；remembered 是已经记住的
  const [per100, setPer100] = useState<Per100[]>([])
  const [remembered, setRemembered] = useState<Per100[]>([])
  const foods = useLiveQuery(() => db.foods.toArray())
  // 一打开就要算的，先显示「在算」，免得还没算完就能点记录
  const [busy, setBusy] = useState(!first.answer)
  const [error, setError] = useState('')
  const [fix, setFix] = useState('')
  const started = useRef(false)
  const photoUrl = useBlobUrl(meal?.photo ?? first.photo)

  const run = async (ts: Turn[]) => {
    setBusy(true)
    setError('')
    try {
      const r = await estimate(settings ?? { key: 'app', arkKey: '', model: '' }, ts, await db.foods.toArray())
      // 把豆包的回答接在最后一轮上，纠正时它能看到上一次的结果
      setTurns(ts.map((t, i) => (i === ts.length - 1 ? { ...t, answer: r.raw } : t)))
      setItems(r.items)
      per.current.clear()
      setNote(r.note)
      setDay(r.day)
      if (r.time || !meal) setTime(r.time) // 改旧的一餐时，豆包没说钟点就保持原来的
      setPer100(r.per100)
      // 说了「记住这个」的直接存，不用再点按钮
      const auto = r.per100.filter((f) => f.remember)
      for (const f of auto) await rememberFood(f.name, f.per100)
      // 只是让记住、没吃东西：不停在「这一餐」上
      if (auto.length && !r.items.length) return onDone(false, [...remembered, ...auto])
      if (auto.length) setRemembered((xs) => [...xs, ...auto])
      setFix('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (started.current) return // 开发模式下 effect 会跑两次，别重复花钱
    started.current = true
    // 点「修改」打开的：已经有原来的结果，等用户自己改，不先花钱算
    if (!turns[turns.length - 1].answer) run(turns)
  }, [])

  const correct = () => {
    if (!fix.trim() || busy) return
    // 上一次的回答换成卡片上现在的样子，手动改过的数豆包也能看到
    const last = turns.length - 1
    const ts = items.length
      ? turns.map((t, i) => (i === last ? { ...t, answer: asAnswer(kept, note, day, time, per100) } : t))
      : turns
    run([...ts, { text: fix.trim() }])
  }

  // 改重量时营养按比例跟着变；改热量只改热量
  // 每克营养按开始改克数前的数算、不中途取整：逐个字输入「150」、先删空再填，都不会算偏
  const per = useRef(new Map<number, Nutr>())
  const setGrams = (i: number, g: number) =>
    setItems((xs) =>
      xs.map((x, j) => {
        if (j !== i) return x
        let d = per.current.get(i)
        if (!d && x.grams) {
          const k = 1 / x.grams
          d = { kcal: x.nutr.kcal * k, protein: x.nutr.protein * k, carbs: x.nutr.carbs * k, fat: x.nutr.fat * k }
          per.current.set(i, d)
        }
        if (!d || !(g > 0)) return { ...x, grams: g > 0 ? g : null }
        return { ...x, grams: g, nutr: { kcal: d.kcal * g, protein: d.protein * g, carbs: d.carbs * g, fat: d.fat * g } }
      }),
    )
  const setKcal = (i: number, kcal: number) => {
    per.current.delete(i)
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, nutr: { ...x.nutr, kcal } } : x)))
  }
  const setName = (i: number, name: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, name } : x)))
  const remove = (i: number) => {
    per.current.clear()
    setItems((xs) => xs.filter((_, j) => j !== i))
  }
  const addItem = () => setItems((xs) => [...xs, { name: '', nutr: { ...ZERO } }])
  // 空着没填的一行不存；热量存整数
  const kept = items
    .filter((x) => x.name.trim() || x.nutr.kcal)
    .map((x) => ({ ...x, name: x.name.trim() || '其他', nutr: { ...x.nutr, kcal: Math.round(x.nutr.kcal) } }))

  const save = async () => {
    const said = turns.slice(meal ? 1 : before.length).map((t) => t.text?.trim())
    if (meal) {
      await putMeal({ ...meal, items: kept, note, time: time || meal.time, input: [meal.input, ...said].filter(Boolean).join(' / ') })
    } else {
      await addMeal({
        id: newId(),
        owner: 'me',
        date: addDays(today(), day),
        time: time || hm(),
        items: kept,
        input: said.filter(Boolean).join(' / '),
        photo: first.photo,
        note,
        createdAt: Date.now(),
      })
    }
    onDone(true, remembered)
  }

  const total = sumNutr(items)

  return (
    <div className="mask">
      <div className="sheet draft">
        <div className="drafthead">
          {photoUrl && <img src={photoUrl} alt="" />}
          <div>
            <h2>{meal ? `改 ${meal.time} 这一餐` : '这一餐'}</h2>
            {first.text && <div className="sub">{first.text}</div>}
          </div>
        </div>

        {busy && <div className="busy">豆包在算…</div>}
        {error && <div className="error">{error}</div>}

        {!busy && meal && <p className="sub">点名字、克数、热量直接改；改克数，蛋白碳水脂肪跟着变。</p>}

        {!busy && items.length > 0 && (
          <>
            <div className="items">
              {items.map((x, i) => (
                <div className="item" key={i}>
                  <input
                    className="name"
                    value={x.name}
                    placeholder="吃了什么"
                    onChange={(e) => setName(i, e.target.value)}
                  />
                  <label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={x.grams ?? ''}
                      onChange={(e) => setGrams(i, Number(e.target.value))}
                    />
                    g{x.raw === true ? '生' : x.raw === false ? '熟' : ''}
                  </label>
                  <label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={Math.round(x.nutr.kcal)}
                      onChange={(e) => setKcal(i, Number(e.target.value))}
                    />
                    千卡
                  </label>
                  <button className="x" onClick={() => remove(i)} aria-label="删掉这一样">
                    ×
                  </button>
                  <div className="macro">{fmtNutr(x.nutr)}</div>
                </div>
              ))}
            </div>
            <div className="total">
              合计 <b>{Math.round(total.kcal)}</b> 千卡 · {fmtNutr(total)}
            </div>
            {meal ? (
              <label className="when">
                几点吃的
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            ) : (
              (day !== 0 || time) && (
                <div className="sub">
                  记在{day === 0 ? '今天' : day === -1 ? '昨天' : md(addDays(today(), day))}
                  {time && ` ${time}`}
                </div>
              )
            )}
          </>
        )}
        {!busy && (
          <button className="additem" onClick={addItem}>
            + 加一样
          </button>
        )}
        {!busy && note && <p className="note">{note}</p>}

        {!busy &&
          per100.map((f) => {
            const done = remembered.some((x) => x.name === f.name)
            // 早就记住、数也一样的不再问
            if (!done && known(foods ?? [], f.name, f.per100)) return null
            return done ? (
              <div className="remember done" key={f.name}>
                <span className="check">✓</span>
                <div>
                  <div className="title">已记住「{f.name}」</div>
                  每 100 克 {f.per100.kcal} 千卡
                  <br />
                  {fmtNutr(f.per100)}
                </div>
              </div>
            ) : (
              <div className="remember" key={f.name}>
                <div>
                  <div className="title">{f.name}</div>
                  每 100 克 {f.per100.kcal} 千卡
                  <br />
                  {fmtNutr(f.per100)}
                </div>
                <button
                  className="btn"
                  onClick={async () => {
                    await rememberFood(f.name, f.per100)
                    if (!items.length) onDone(false, [...remembered, f])
                    else setRemembered((xs) => [...xs, f])
                  }}
                >
                  记住它
                </button>
              </div>
            )
          })}

        {!busy && (
          <div className="fix">
            <input
              className="input"
              value={fix}
              placeholder={
                meal
                  ? '或说一句让豆包改，如「饭只吃了一半」「牛肉是 150 克生重」'
                  : '不对就说一句，如「饭只吃了一半」「记住这个蛋白粉」'
              }
              onChange={(e) => setFix(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && correct()}
            />
            <button className="btn" disabled={!fix.trim()} onClick={correct}>
              重新算
            </button>
          </div>
        )}

        <div className="actions">
          <button className="btn" onClick={() => onDone(false, remembered)}>
            取消
          </button>
          <span className="spacer" />
          {error && !busy && (
            <button className="btn" onClick={() => run(turns)}>
              重试
            </button>
          )}
          <button className="btn primary" disabled={busy || !kept.length} onClick={save}>
            {meal ? '保存' : '记录'}
          </button>
        </div>
      </div>
    </div>
  )
}
