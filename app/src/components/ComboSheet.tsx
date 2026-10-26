import { deleteCombo, sumNutr, type Combo } from '../db'
import { renameCombo } from '../combos'
import { fmtNutr } from '../nutr'
import FoodRows from './FoodRows'

// 点套餐按钮：先看里面有什么，再决定照着记、改名字或删掉
export default function ComboSheet({
  combo,
  onEat,
  onClose,
}: {
  combo: Combo
  onEat: () => void
  onClose: () => void
}) {
  const total = sumNutr(combo.items)

  const rename = async () => {
    const name = prompt('新名字', combo.name)?.trim().slice(0, 12)
    if (!name || name === combo.name) return
    try {
      await renameCombo(combo, name)
      onClose()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const remove = async () => {
    if (!confirm(`删掉套餐「${combo.name}」？已经记下的饭不受影响。`)) return
    await deleteCombo(combo.id)
    onClose()
  }

  return (
    <div className="mask" onClick={onClose}>
      <div className="sheet combosheet" onClick={(e) => e.stopPropagation()}>
        <h2>{combo.name}</h2>
        <FoodRows items={combo.items} />
        <div className="total">
          合计 <b>{Math.round(total.kcal)}</b> 千卡 · {fmtNutr(total)}
        </div>
        <p className="sub">
          直接说「还是{combo.name}」也能记；有变化就加一句，如「还是{combo.name}，饭少一半」。
        </p>
        <button className="btn primary wide" onClick={onEat}>
          照这个记一餐
        </button>
        <div className="actions">
          <button className="btn" onClick={rename}>
            改名字
          </button>
          <button className="btn danger" onClick={remove}>
            删掉套餐
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
