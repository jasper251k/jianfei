import { useState } from 'react'
import { deleteMeal, sumNutr, type Meal } from '../db'
import { useBlobUrl } from '../photos'
import { fmtNutr } from '../nutr'

// 今天页里的一餐：点开看明细和豆包的假设，可删除
export default function MealCard({ meal }: { meal: Meal }) {
  const [open, setOpen] = useState(false)
  const url = useBlobUrl(meal.photo)
  const total = sumNutr(meal.items)

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
