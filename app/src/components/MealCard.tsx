import { useState } from 'react'
import { deleteMeal, sumNutr, type Meal } from '../db'
import { useBlobUrl } from '../photos'
import { fmtNutr } from '../nutr'
import { nextName, saveCombo } from '../combos'

// 今天页里的一餐：点开看明细和豆包的假设，可删除、存成套餐
export default function MealCard({ meal, onSaid }: { meal: Meal; onSaid: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  const url = useBlobUrl(meal.photo)
  const total = sumNutr(meal.items)

  const toCombo = async () => {
    const name = prompt('给这一餐起个名字，以后说「还是套餐一」就照着记', await nextName())?.trim()
    if (!name) return
    try {
      await saveCombo(name.slice(0, 12), meal.items, meal.note)
      onSaid(`已存成「${name.slice(0, 12)}」，以后说「还是${name.slice(0, 12)}」就行`)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div className="meal" onClick={() => setOpen(!open)}>
      <div className="mealrow">
        {url ? <img src={url} alt="" /> : <span className="noimg">{meal.time}</span>}
        <div className="mealtext">
          <div className="names">{meal.items.map((i) => i.name).join('、')}</div>
          <div className="sub">
            {url && `${meal.time} · `}
            {fmtNutr(total)}
          </div>
        </div>
        <div className="kcal">
          {Math.round(total.kcal)}
          <small>千卡</small>
        </div>
      </div>
      {open && (
        <div className="mealmore">
          {meal.items.map((i, k) => (
            <div className="row" key={k}>
              <span>
                {i.name}
                {i.grams ? ` ${Math.round(i.grams)}g${i.raw === true ? '生' : i.raw === false ? '熟' : ''}` : ''}
              </span>
              <span className="num">{Math.round(i.nutr.kcal)} 千卡</span>
            </div>
          ))}
          {meal.input && <p className="sub">你说的：{meal.input}</p>}
          {meal.note && <p className="sub">豆包的假设：{meal.note}</p>}
          <button
            className="btn"
            onClick={(e) => {
              e.stopPropagation()
              toCombo()
            }}
          >
            存成套餐
          </button>
          <button
            className="btn danger"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm('删掉这一餐？')) deleteMeal(meal.id)
            }}
          >
            删除这一餐
          </button>
        </div>
      )}
    </div>
  )
}
