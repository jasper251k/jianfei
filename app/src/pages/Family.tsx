import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, sumNutr, type FamilyInfo, type Meal, type Settings, type Weight } from '../db'
import { cloud, type Member } from '../cloud'
import { markAllPending, saveWho, syncNow, useSyncStatus } from '../sync'
import { addDays, md, today } from '../date'
import { avatarFrom } from '../photos'
import { dailyTarget } from '../target'
import { fmtDiff, fmtKg, prevOf } from '../weights'
import { fmtNutr } from '../nutr'
import Avatar, { memberColor } from '../components/Avatar'
import Diff from '../components/Diff'
import FamilyChart from '../components/FamilyChart'
import WeightChart from '../components/WeightChart'
import Budget from '../components/Budget'

const RANGES = [
  { label: '30 天', days: 30 },
  { label: '90 天', days: 90 },
  { label: '全部', days: 0 },
]

export const inviteLink = (code: string) => `${location.origin}${location.pathname}?join=${code}`

export default function Family({
  family,
  weights,
  settings,
}: {
  family?: FamilyInfo
  weights: Weight[]
  settings?: Settings
}) {
  if (!family) return <Start settings={settings} />
  return <Members family={family} myWeights={weights} />
}

// ---------- 还没加入：创建家庭 ----------

function Start({ settings }: { settings?: Settings }) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const who = await cloud.createFamily({
        name: name.trim(),
        avatar,
        pin,
        arkKey: settings?.arkKey ?? '',
        model: settings?.model ?? '',
        profile: settings?.profile,
        custom: settings?.custom,
      })
      await saveWho(who)
      await markAllPending() // 手机上已有的记录都传上去
      syncNow()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="family">
      <header className="pagehead">
        <h1>家人</h1>
      </header>
      <section className="card">
        <p className="lead">建一个家庭，把邀请链接发到微信里，家人点开就能加入，互相看到体重和每天吃了多少。</p>
        <ProfileFields name={name} setName={setName} avatar={avatar} setAvatar={setAvatar} />
        <PinField pin={pin} setPin={setPin} />
        <p className="hint">你手机上已有的体重和饮食会一起传上去（照片不传）。豆包的 Key 全家共用你这个。</p>
        {error && <p className="error">{error}</p>}
        <button className="btn primary wide" disabled={busy || !name.trim() || !isPin(pin)} onClick={create}>
          {busy ? '创建中…' : '创建家庭'}
        </button>
      </section>
    </div>
  )
}

export function ProfileFields({
  name,
  setName,
  avatar,
  setAvatar,
}: {
  name: string
  setName: (s: string) => void
  avatar: string
  setAvatar: (s: string) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="profilefields">
      <button className="avatarpick" onClick={() => file.current?.click()} aria-label="选头像">
        <Avatar name={name || '?'} src={avatar} color="#8a8a8e" size={64} />
        <span>{avatar ? '换头像' : '选头像'}</span>
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) setAvatar(await avatarFrom(f))
        }}
      />
      <label className="field grow">
        <span>名字</span>
        <input className="input" value={name} maxLength={20} placeholder="比如：老妈" onChange={(e) => setName(e.target.value)} />
      </label>
    </div>
  )
}

export const isPin = (s: string) => /^\d{4}$/.test(s)

// 4 位数字密码：换手机选「我是 XX」时要输
export function PinField({
  pin,
  setPin,
  label = '4 位数字密码（换手机时用它接回自己，记住它）',
}: {
  pin: string
  setPin: (s: string) => void
  label?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        placeholder="比如：2580"
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
    </label>
  )
}

// ---------- 已加入：全家 ----------

function Members({ family, myWeights }: { family: FamilyInfo; myWeights: Weight[] }) {
  const [days, setDays] = useState(30)
  const [open, setOpen] = useState<string>()
  const [invite, setInvite] = useState(false)
  const [editMe, setEditMe] = useState(false)
  const sync = useSyncStatus()
  const now = today()

  const famWeights = useLiveQuery(() => db.familyWeights.orderBy('key').toArray()) ?? []
  const famMeals = useLiveQuery(() => db.familyMeals.where('date').equals(now).toArray(), [now]) ?? []
  const myMeals = useLiveQuery(() => db.meals.where('date').equals(now).toArray(), [now]) ?? []

  const weightsOf = (m: Member): Weight[] =>
    m.memberId === family.memberId
      ? myWeights
      : famWeights
          .filter((w) => w.memberId === m.memberId)
          .map((w) => ({ date: w.date, kg: w.kg }))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
  const mealsOf = (m: Member): Pick<Meal, 'items'>[] =>
    m.memberId === family.memberId ? myMeals : famMeals.filter((x) => x.memberId === m.memberId)

  const members = family.members
  const lines = members.map((m, i) => ({ name: m.name, color: memberColor(i), weights: weightsOf(m) }))
  const opened = members.find((m) => m.memberId === open)

  if (opened)
    return (
      <MemberDetail
        member={opened}
        color={memberColor(members.indexOf(opened))}
        weights={weightsOf(opened)}
        onBack={() => setOpen(undefined)}
      />
    )

  return (
    <div className="family">
      <header className="pagehead">
        <h1>家人</h1>
        <span className="sub">{sync.syncing ? '同步中…' : sync.error ? '' : '已同步'}</span>
        <span className="spacer" />
        <button className="gear" onClick={() => setInvite(true)}>
          邀请家人
        </button>
      </header>
      {sync.error && (
        <p className="error" onClick={() => syncNow()}>
          同步失败：{sync.error}（点这里重试）
        </p>
      )}

      <section className="card list">
        {members.map((m, i) => {
          const ws = weightsOf(m)
          const last = ws[ws.length - 1]
          const first = ws[0]
          const prev = last && prevOf(ws, last.date)
          const eaten = sumNutr(mealsOf(m).flatMap((x) => x.items))
          const target = dailyTarget(
            { key: 'app', arkKey: '', model: '', profile: m.profile ?? undefined, custom: m.custom ?? undefined },
            last?.kg,
          )
          const isMe = m.memberId === family.memberId
          return (
            <button className="memberrow" key={m.memberId} onClick={() => setOpen(m.memberId)}>
              <Avatar name={m.name} src={m.avatar} color={memberColor(i)} />
              <div className="mtext">
                <div className="mname">
                  {m.name}
                  {isMe && <span className="sub">（我）</span>}
                </div>
                <div className="sub">
                  {last ? (
                    <>
                      {last.date === now ? '今天' : md(last.date)} {fmtKg(last.kg)} kg
                      {first && first.date !== last.date && <> · 累计 {fmtDiff(last.kg - first.kg)}</>}
                    </>
                  ) : (
                    '还没记体重'
                  )}
                </div>
                <div className="sub">
                  今天吃了 {Math.round(eaten.kcal)}
                  {target ? ` / ${Math.round(target.kcal)}` : ''} 千卡
                </div>
              </div>
              <span className="diffcell">{last && prev && <Diff value={last.kg - prev.kg} />}</span>
            </button>
          )
        })}
      </section>

      <div className="seg">
        {RANGES.map((r) => (
          <button key={r.days} className={days === r.days ? 'on' : ''} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>
      <section className="card">
        <div className="label">体重变化对比（和各自第一次记录比，7 天平均）</div>
        <FamilyChart lines={lines} days={days} />
      </section>

      <p className="hint">
        <button className="linkbtn" onClick={() => setEditMe(true)}>
          改我的名字、头像和密码
        </button>
      </p>

      {invite && <InviteSheet code={family.code} onClose={() => setInvite(false)} />}
      {editMe && (
        <EditMeSheet me={members.find((m) => m.memberId === family.memberId)} onClose={() => setEditMe(false)} />
      )}
    </div>
  )
}

function MemberDetail({
  member,
  color,
  weights,
  onBack,
}: {
  member: Member
  color: string
  weights: Weight[]
  onBack: () => void
}) {
  const now = today()
  const [days, setDays] = useState(30)
  const meals = useLiveQuery(
    () => db.familyMeals.where('memberId').equals(member.memberId).toArray(),
    [member.memberId],
  )
  const mine = useLiveQuery(() => db.meals.toArray())
  const fam = useLiveQuery(() => db.family.get('family'))
  const isMe = fam?.memberId === member.memberId
  // 建家庭的人（最早加入的）能帮别人重设密码
  const canReset = !!fam && !isMe && fam.members[0]?.memberId === fam.memberId
  const resetPin = async () => {
    const pin = prompt(`给${member.name}设一个新的 4 位数字密码`)?.trim()
    if (pin === undefined) return
    if (!isPin(pin)) return alert('密码要 4 位数字')
    try {
      await cloud.setPin(pin, member.memberId)
      alert(`已重设，把新密码 ${pin} 告诉${member.name}`)
    } catch (e) {
      alert((e as Error).message)
    }
  }
  const all = (isMe ? mine : meals) ?? []
  const todays = all.filter((m) => m.date === now).sort((a, b) => a.createdAt - b.createdAt)
  const eaten = sumNutr(todays.flatMap((m) => m.items))
  const last = weights[weights.length - 1]
  const target = dailyTarget(
    { key: 'app', arkKey: '', model: '', profile: member.profile ?? undefined, custom: member.custom ?? undefined },
    last?.kg,
  )
  const from = days ? addDays(now, -(days - 1)) : (weights[0]?.date ?? now)

  return (
    <div className="family">
      <header className="pagehead">
        <button className="arrow" onClick={onBack} aria-label="返回">
          ‹
        </button>
        <Avatar name={member.name} src={member.avatar} color={color} size={32} />
        <h1>{member.name}</h1>
      </header>

      <section className="card">
        <div className="label">今天吃的</div>
        <Budget eaten={eaten} target={target} hint={isMe} />
        {todays.length > 0 && (
          <div className="meals">
            {todays.map((m) => (
              <div className="meal" key={m.id}>
                <div className="mealrow">
                  <span className="noimg">{m.time}</span>
                  <div className="mealtext">
                    <div className="names">{m.items.map((i) => i.name).join('、')}</div>
                    <div className="sub">{fmtNutr(sumNutr(m.items))}</div>
                  </div>
                  <div className="kcal">
                    {Math.round(sumNutr(m.items).kcal)}
                    <small>千卡</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="seg">
        {RANGES.map((r) => (
          <button key={r.days} className={days === r.days ? 'on' : ''} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>
      <section className="card">
        {weights.length < 2 ? <p className="hint">记满两天就能看到折线图。</p> : <WeightChart weights={weights} from={from} to={now} />}
      </section>
      {canReset && (
        <p className="hint">
          <button className="linkbtn" onClick={resetPin}>
            {member.name}忘了密码？点这里重设
          </button>
        </p>
      )}
    </div>
  )
}

function InviteSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const link = inviteLink(code)
  const [copied, setCopied] = useState(false)
  const text = `一起用「减肥记」记体重和饮食吧，点开就能加入我们家：\n${link}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      prompt('长按复制下面的文字，发到微信里', text)
    }
  }
  return (
    <div className="mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>邀请家人</h2>
        <p className="hint">把链接发到微信里，家人点开后填名字就能加入。链接只发给家人，拿到的人都能看到全家的记录。</p>
        <div className="invitebox">{link}</div>
        <div className="actions">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            关闭
          </button>
          <button className="btn primary" onClick={copy}>
            {copied ? '已复制' : '复制链接'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditMeSheet({ me, onClose }: { me?: Member; onClose: () => void }) {
  const [name, setName] = useState(me?.name ?? '')
  const [avatar, setAvatar] = useState(me?.avatar ?? '')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true)
    try {
      if (pin) await cloud.setPin(pin)
      await saveWho(await cloud.updateMe({ name: name.trim(), avatar }))
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  const leave = async () => {
    if (!confirm('这台手机退出家庭？你的记录还留在手机上和云端，以后用邀请链接选「我是…」可以接回。')) return
    await cloud.leaveFamily()
    await saveWho({ family: null })
    onClose()
  }
  return (
    <div className="mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>我的资料</h2>
        <ProfileFields name={name} setName={setName} avatar={avatar} setAvatar={setAvatar} />
        <PinField pin={pin} setPin={setPin} label="改密码（不改就空着）" />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn danger" onClick={leave}>
            退出家庭
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" disabled={busy || !name.trim() || (!!pin && !isPin(pin))} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
