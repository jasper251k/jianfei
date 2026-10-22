import { useState } from 'react'
import { db, type Nutr, type Settings as S } from '../db'
import { ACTIVITY, GOALS, recommend, type Profile, type Sex } from '../target'
import { fmtKg } from '../weights'
import { cloud } from '../cloud'
import { saveWho, syncNow } from '../sync'

export default function Settings({
  settings,
  latestKg,
  inFamily,
  onClose,
}: {
  settings?: S
  latestKg?: number
  inFamily: boolean
  onClose: () => void
}) {
  const [arkKey, setArkKey] = useState(settings?.arkKey ?? '')
  const [model, setModel] = useState(settings?.model ?? '')

  const p = settings?.profile
  const [sex, setSex] = useState<Sex>(p?.sex ?? 'male')
  const [age, setAge] = useState(p ? String(p.age) : '')
  const [height, setHeight] = useState(p ? String(p.heightCm) : '')
  const [activity, setActivity] = useState(p?.activity ?? 2)
  const [goal, setGoal] = useState(p?.goal ?? 1)
  const [kgInput, setKgInput] = useState('')
  const kg = latestKg ?? Number(kgInput)

  const profile: Profile | undefined =
    Number(age) > 0 && Number(height) > 0 ? { sex, age: Number(age), heightCm: Number(height), activity, goal } : undefined
  const rec = profile && kg > 0 ? recommend(profile, kg) : undefined

  // 自己定目标：打开时用推荐值打底
  const [useCustom, setUseCustom] = useState(!!settings?.custom)
  const [custom, setCustom] = useState<Nutr | undefined>(settings?.custom)
  const shown = useCustom ? (custom ?? rec?.target) : rec?.target
  const setField = (k: keyof Nutr, v: number) =>
    setCustom({ ...(custom ?? rec?.target ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [k]: v })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const next = {
      key: 'app' as const,
      arkKey: arkKey.trim(),
      model: model.trim(),
      profile,
      custom: useCustom ? (custom ?? rec?.target) : undefined,
    }
    // 加入了家庭：身体数据和目标存到自己的成员资料，豆包设置全家共用
    if (inFamily) {
      setSaving(true)
      setError('')
      try {
        await cloud.updateMe({ profile: next.profile ?? null, custom: next.custom ?? null })
        if (next.arkKey !== (settings?.arkKey ?? '') || next.model !== (settings?.model ?? ''))
          await saveWho(await cloud.updateFamily({ arkKey: next.arkKey, model: next.model }))
      } catch (e) {
        setError((e as Error).message)
        setSaving(false)
        return
      }
      setSaving(false)
    }
    await db.settings.put(next)
    if (inFamily) syncNow()
    onClose()
  }

  return (
    <div className="settings">
      <header className="pagehead">
        <button className="arrow" onClick={onClose} aria-label="返回">
          ‹
        </button>
        <h1>设置</h1>
      </header>

      <section className="card">
        <div className="label">身体数据和目标</div>
        <div className="seg">
          {(['male', 'female'] as Sex[]).map((s) => (
            <button key={s} className={sex === s ? 'on' : ''} onClick={() => setSex(s)}>
              {s === 'male' ? '男' : '女'}
            </button>
          ))}
        </div>
        <div className="two">
          <label className="field">
            <span>年龄</span>
            <input className="input" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
          </label>
          <label className="field">
            <span>身高 cm</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </label>
        </div>
        {latestKg ? (
          <p className="hint">体重按最近一次记录 {fmtKg(latestKg)} kg 算，每次记新体重会自动更新。</p>
        ) : (
          <label className="field">
            <span>体重 kg</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={kgInput}
              onChange={(e) => setKgInput(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          <span>平时活动量</span>
          <select className="input" value={activity} onChange={(e) => setActivity(Number(e.target.value))}>
            {ACTIVITY.map((a, i) => (
              <option key={i} value={i}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>目标</span>
          <select className="input" value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {GOALS.map((g, i) => (
              <option key={i} value={i}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {rec && (
          <div className="rec">
            <div>
              基础代谢 <b>{rec.bmr}</b> 千卡 · 每天总消耗约 <b>{rec.tdee}</b> 千卡
            </div>
            <div>
              建议每天吃 <b>{rec.target.kcal}</b> 千卡：蛋白 {rec.target.protein}g · 碳水 {rec.target.carbs}g · 脂肪{' '}
              {rec.target.fat}g
            </div>
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
          不用建议值，自己定目标
        </label>
        {useCustom && shown && (
          <div className="four">
            {(
              [
                ['kcal', '千卡'],
                ['protein', '蛋白 g'],
                ['carbs', '碳水 g'],
                ['fat', '脂肪 g'],
              ] as [keyof Nutr, string][]
            ).map(([k, label]) => (
              <label className="field" key={k}>
                <span>{label}</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  value={Math.round(shown[k])}
                  onChange={(e) => setField(k, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        )}
        <p className="hint">公式算的是估计值。按这个吃两周，看每周平均体重：每周降 0.25～0.5 kg 正合适；两周几乎不降，就少吃 100～150 千卡。</p>
      </section>

      <section className="card">
        <div className="label">豆包（拍照、打字估热量用）</div>
        <label className="field">
          <span>API Key</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={arkKey}
            placeholder="火山方舟里创建的 API Key"
            onChange={(e) => setArkKey(e.target.value)}
          />
        </label>
        <label className="field">
          <span>模型 ID</span>
          <input
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            value={model}
            placeholder="如 doubao-seed-2-1-turbo-260628"
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <p className="hint">
          在 console.volcengine.com/ark 的「API Key 管理」创建 Key，「模型广场」里点开已开通的模型能看到模型 ID。Key
          {inFamily ? '全家共用这一个 Key，费用算在你的火山引擎账号上。' : '只存在这台手机上。'}
        </p>
      </section>

      {error && <p className="error">{error}</p>}
      <button className="btn primary wide" disabled={saving} onClick={save}>
        {saving ? '保存中…' : '保存'}
      </button>
    </div>
  )
}
