import { useState } from 'react'
import { db, type Settings as S } from '../db'

export default function Settings({ settings, onClose }: { settings?: S; onClose: () => void }) {
  const [arkKey, setArkKey] = useState(settings?.arkKey ?? '')
  const [model, setModel] = useState(settings?.model ?? '')

  const save = async () => {
    await db.settings.put({ key: 'app', arkKey: arkKey.trim(), model: model.trim() })
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
          只存在这台手机上。
        </p>
        <button className="btn primary wide" onClick={save}>
          保存
        </button>
      </section>
    </div>
  )
}
