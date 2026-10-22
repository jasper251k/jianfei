import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Food, type Nutr } from '../db'
import { fmtNutr } from '../nutr'

const FIELDS: [keyof Nutr, string][] = [
  ['kcal', '千卡'],
  ['protein', '蛋白 g'],
  ['carbs', '碳水 g'],
  ['fat', '脂肪 g'],
]

// 设置页里的「我的食物」：豆包记住的每 100 克营养，可以改、删
export default function Foods() {
  const foods = useLiveQuery(() => db.foods.orderBy('createdAt').toArray()) ?? []
  const [edit, setEdit] = useState<Food>()

  return (
    <section className="card">
      <div className="label">我的食物（每 100 克，点一样可以改；改完直接生效）</div>
      {!foods.length && (
        <p className="hint">
          估热量时说「记住这个蛋白粉，每 100 克 370 千卡、蛋白 80、碳水 5、脂肪 3」，或拍营养成分表说「记住这个」，以后提到它就按这个数算。
        </p>
      )}
      {foods.map((f) =>
        edit?.id === f.id ? (
          <div className="foodedit" key={f.id}>
            <input className="input" value={edit.name} maxLength={20} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="four">
              {FIELDS.map(([k, label]) => (
                <label className="field" key={k}>
                  <span>{label}</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    value={edit.per100[k]}
                    onChange={(e) => setEdit({ ...edit, per100: { ...edit.per100, [k]: Number(e.target.value) } })}
                  />
                </label>
              ))}
            </div>
            <div className="actions">
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm(`删掉「${f.name}」？已经记下的饭不受影响。`)) {
                    db.foods.delete(f.id)
                    setEdit(undefined)
                  }
                }}
              >
                删除
              </button>
              <span className="spacer" />
              <button className="btn" onClick={() => setEdit(undefined)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!edit.name.trim()}
                onClick={async () => {
                  await db.foods.put({ ...edit, name: edit.name.trim() })
                  setEdit(undefined)
                }}
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <button className="foodrow" key={f.id} onClick={() => setEdit(f)}>
            <b>{f.name}</b>
            <span className="sub">
              {Math.round(f.per100.kcal)} 千卡 · {fmtNutr(f.per100)}
            </span>
          </button>
        ),
      )}
    </section>
  )
}
