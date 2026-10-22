import { useEffect, useRef, useState } from 'react'
import { addMeal, newId, sumNutr, type Item, type Settings } from '../db'
import { estimate, type Turn } from '../ai'
import { today } from '../date'
import { useBlobUrl } from '../photos'
import { fmtNutr } from '../nutr'

// 豆包估算结果：先确认、可修改、可回一句话重新算，点「记录」才存
export default function MealDraft({
  settings,
  first,
  onDone,
}: {
  settings?: Settings
  first: Turn
  onDone: (saved: boolean) => void
}) {
  const [turns, setTurns] = useState<Turn[]>([first])
  const [items, setItems] = useState<Item[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fix, setFix] = useState('')
  const started = useRef(false)
  const photoUrl = useBlobUrl(first.photo)

  const run = async (ts: Turn[]) => {
    setBusy(true)
    setError('')
    try {
      const r = await estimate(settings ?? { key: 'app', arkKey: '', model: '' }, ts)
      // 把豆包的回答接在最后一轮上，纠正时它能看到上一次的结果
      setTurns(ts.map((t, i) => (i === ts.length - 1 ? { ...t, answer: r.raw } : t)))
      setItems(r.items)
      setNote(r.note)
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
    run(turns)
  }, [])

  const correct = () => {
    if (!fix.trim() || busy) return
    run([...turns, { text: fix.trim() }])
  }

  // 改重量时营养按比例跟着变；改热量只改热量
  const setGrams = (i: number, g: number) =>
    setItems((xs) =>
      xs.map((x, j) => {
        if (j !== i) return x
        const k = x.grams && g > 0 ? g / x.grams : 1
        const nutr = {
          kcal: Math.round(x.nutr.kcal * k),
          protein: x.nutr.protein * k,
          carbs: x.nutr.carbs * k,
          fat: x.nutr.fat * k,
        }
        return { ...x, grams: g, nutr }
      }),
    )
  const setKcal = (i: number, kcal: number) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, nutr: { ...x.nutr, kcal } } : x)))
  const setName = (i: number, name: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, name } : x)))
  const remove = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i))

  const save = async () => {
    const d = new Date()
    await addMeal({
      id: newId(),
      owner: 'me',
      date: today(),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      items,
      input: turns
        .map((t) => t.text?.trim())
        .filter(Boolean)
        .join(' / '),
      photo: first.photo,
      note,
      createdAt: Date.now(),
    })
    onDone(true)
  }

  const total = sumNutr(items)

  return (
    <div className="mask">
      <div className="sheet draft">
        <div className="drafthead">
          {photoUrl && <img src={photoUrl} alt="" />}
          <div>
            <h2>这一餐</h2>
            {first.text && <div className="sub">{first.text}</div>}
          </div>
        </div>

        {busy && <div className="busy">豆包在算…</div>}
        {error && <div className="error">{error}</div>}

        {!busy && items.length > 0 && (
          <>
            <div className="items">
              {items.map((x, i) => (
                <div className="item" key={i}>
                  <input className="name" value={x.name} onChange={(e) => setName(i, e.target.value)} />
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
                      value={x.nutr.kcal}
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
          </>
        )}
        {!busy && note && <p className="note">{note}</p>}

        {!busy && (
          <div className="fix">
            <input
              className="input"
              value={fix}
              placeholder="不对就说一句，如「饭只吃了一半」"
              onChange={(e) => setFix(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && correct()}
            />
            <button className="btn" disabled={!fix.trim()} onClick={correct}>
              重新算
            </button>
          </div>
        )}

        <div className="actions">
          <button className="btn" onClick={() => onDone(false)}>
            取消
          </button>
          <span className="spacer" />
          {error && !busy && (
            <button className="btn" onClick={() => run(turns)}>
              重试
            </button>
          )}
          <button className="btn primary" disabled={busy || !items.length} onClick={save}>
            记录
          </button>
        </div>
      </div>
    </div>
  )
}
