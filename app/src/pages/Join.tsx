import { useEffect, useState } from 'react'
import { cloud, type Member } from '../cloud'
import { markAllPending, saveWho, syncNow } from '../sync'
import Avatar, { memberColor } from '../components/Avatar'
import { PinField, ProfileFields, isPin } from './Family'

type Peek = Pick<Member, 'memberId' | 'name' | 'avatar'>

// 点邀请链接打开：选「我是 XX」输密码接回，或者填名字新加入
export default function Join({ code, onDone }: { code: string; onDone: () => void }) {
  const [members, setMembers] = useState<Peek[]>()
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [pin, setPin] = useState('')
  const [back, setBack] = useState<Peek>() // 选了「我是 XX」
  const [backPin, setBackPin] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    cloud
      .peekFamily(code)
      .then((r) => setMembers(r.members))
      .catch((e) => setError((e as Error).message))
  }, [code])

  const join = async (memberId?: string) => {
    setBusy(true)
    setError('')
    try {
      await saveWho(
        await cloud.joinFamily(memberId ? { code, memberId, pin: backPin } : { code, pin, name: name.trim(), avatar }),
      )
      await markAllPending()
      syncNow()
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="family">
      <header className="pagehead">
        <h1>加入家庭</h1>
      </header>

      {!members && !error && <p className="hint">正在打开…</p>}
      {error && <p className="error">{error}</p>}

      {members && (
        <>
          <section className="card">
            <div className="label">家里已经有</div>
            <div className="peek">
              {members.map((m, i) => (
                <span key={m.memberId}>
                  <Avatar name={m.name} src={m.avatar} color={memberColor(i)} size={36} />
                  {m.name}
                </span>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="label">第一次来：填名字加入</div>
            <ProfileFields name={name} setName={setName} avatar={avatar} setAvatar={setAvatar} />
            <PinField pin={pin} setPin={setPin} />
            <button className="btn primary wide" disabled={busy || !name.trim() || !isPin(pin)} onClick={() => join()}>
              {busy ? '加入中…' : '加入'}
            </button>
          </section>

          <section className="card">
            <div className="label">以前加入过（换了手机）：点自己，输密码</div>
            <div className="peek">
              {members.map((m, i) => (
                <button
                  key={m.memberId}
                  className={back?.memberId === m.memberId ? 'on' : ''}
                  disabled={busy}
                  onClick={() => {
                    setBack(m)
                    setBackPin('')
                    setError('')
                  }}
                >
                  <Avatar name={m.name} src={m.avatar} color={memberColor(i)} size={36} />
                  我是{m.name}
                </button>
              ))}
            </div>
            {back && (
              <>
                <PinField pin={backPin} setPin={setBackPin} label={`${back.name}的 4 位数字密码`} />
                <button className="btn primary wide" disabled={busy || !isPin(backPin)} onClick={() => join(back.memberId)}>
                  {busy ? '接回中…' : `接回${back.name}的记录`}
                </button>
                <p className="hint">忘了密码就请建家庭的人在「家人」里点你，帮你重设。</p>
              </>
            )}
          </section>
        </>
      )}

      <p className="hint">
        <button className="linkbtn" onClick={onDone}>
          先不加入
        </button>
      </p>
    </div>
  )
}
