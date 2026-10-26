import { useState } from 'react'
import type { Item } from '../db'

const g = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

// 一餐里的每样食物：点一下展开看蛋白、碳水、脂肪；脂肪换算成「约几勺油」，看得出油藏在哪
export default function FoodRows({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number>()
  return (
    <div className="foodrows">
      {items.map((i, k) => (
        <div
          key={k}
          className={`fitem${open === k ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(open === k ? undefined : k)
          }}
        >
          <div className="row">
            <span>
              {i.name}
              {i.grams ? ` ${Math.round(i.grams)}g${i.raw === true ? '生' : i.raw === false ? '熟' : ''}` : ''}
            </span>
            <span className="num">
              {Math.round(i.nutr.kcal)} 千卡 <span className="chev">{open === k ? '▴' : '▾'}</span>
            </span>
          </div>
          {open === k && (
            <div className="macrobox">
              <span>
                <b>{g(i.nutr.protein)}</b>克<small>蛋白质</small>
              </span>
              <span>
                <b>{g(i.nutr.carbs)}</b>克<small>碳水</small>
              </span>
              <span className="fat">
                <b>{g(i.nutr.fat)}</b>克<small>脂肪（油）</small>
              </span>
              {i.nutr.fat >= 1 && (
                <p>
                  {/* 一小勺（瓷勺）油约 10 克 */}
                  这些脂肪差不多等于 {g(i.nutr.fat / 10)} 勺油
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
