// 清减的后端：网页通过 HTTP 调用这里，这里读写云数据库。
// 身份：每台手机一个随机设备码 device，devices 表记着它属于哪个家庭、哪个人。
const crypto = require('crypto')
const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.database()
const _ = db.command

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
}
const COLLECTIONS = ['families', 'devices', 'members', 'weights', 'meals']

const reply = (status, data) => ({ statusCode: status, headers: HEADERS, body: JSON.stringify(data) })
class Bad extends Error {}
const bad = (msg) => {
  throw new Bad(msg)
}

// 家庭码：8 位，去掉容易看错的 0/O/1/I
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
const newId = () => crypto.randomBytes(8).toString('hex')

// 每人一个 4 位数字密码，换手机选「我是 XX」时要输；云端只存加盐后的哈希
const isPin = (v) => typeof v === 'string' && /^\d{4}$/.test(v)
const pinHash = (memberId, pin) => crypto.createHash('sha256').update(memberId + ':' + pin).digest('hex')
const needPin = (pin) => isPin(pin) || bad('设一个 4 位数字的密码')
const MAX_TRIES = 5
const LOCK_MS = 60 * 60 * 1000
const LOCKED = '密码输错太多次，1 小时后再试；忘了密码就请建家庭的人帮你重设'

let ready = false
async function ensureCollections() {
  if (ready) return
  for (const c of COLLECTIONS) {
    try {
      await db.createCollection(c)
    } catch (e) {
      // 已存在
    }
  }
  ready = true
}

const getOne = async (coll, where) => (await db.collection(coll).where(where).limit(1).get()).data[0]
const getAll = async (coll, where) => {
  const out = []
  for (;;) {
    const r = await db.collection(coll).where(where).skip(out.length).limit(1000).get()
    out.push(...r.data)
    if (r.data.length < 1000) return out
  }
}

// ---------- 数据清洗：只收认识的字段 ----------

const str = (v, max = 100) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const nutr = (n) => ({ kcal: num(n && n.kcal), protein: num(n && n.protein), carbs: num(n && n.carbs), fat: num(n && n.fat) })

// 身体数据：字段同 app/src/target.ts 的 Profile
const cleanProfile = (p) =>
  p && typeof p === 'object' && (p.sex === 'male' || p.sex === 'female')
    ? { sex: p.sex, age: num(p.age), heightCm: num(p.heightCm), activity: num(p.activity), goal: num(p.goal) }
    : null

function cleanMember(m) {
  const out = {}
  if (m.name !== undefined) out.name = str(m.name, 20).trim() || '未命名'
  if (m.avatar !== undefined) out.avatar = str(m.avatar, 60000) // 160 像素的 JPEG data URL
  if (m.profile !== undefined) out.profile = cleanProfile(m.profile)
  if (m.custom !== undefined) out.custom = m.custom ? nutr(m.custom) : null
  return out
}

function cleanMeal(m) {
  if (!m || typeof m.id !== 'string' || !isDate(m.date)) bad('饮食记录格式不对')
  return {
    id: str(m.id, 40),
    date: m.date,
    time: str(m.time, 5),
    items: (Array.isArray(m.items) ? m.items : []).slice(0, 30).map((i) => ({
      name: str(i && i.name, 40),
      grams: i && typeof i.grams === 'number' ? i.grams : null,
      raw: i && typeof i.raw === 'boolean' ? i.raw : null,
      nutr: nutr(i && i.nutr),
    })),
    input: str(m.input, 500),
    note: str(m.note, 500),
    createdAt: num(m.createdAt),
  }
}

// ---------- 接口 ----------

// 这台手机是谁；没加入家庭时 family 为 null
async function whoami(device) {
  const d = await getOne('devices', { device })
  if (!d) return { family: null }
  const family = await getOne('families', { familyId: d.familyId })
  if (!family) return { family: null }
  const members = await getAll('members', { familyId: d.familyId })
  members.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) // 加入顺序，手机上按这个分配颜色
  return {
    family: { familyId: family.familyId, code: family.code, arkKey: family.arkKey || '', model: family.model || '' },
    memberId: d.memberId,
    members: members.map(publicMember),
  }
}

const publicMember = (m) => ({
  memberId: m.memberId,
  name: m.name,
  avatar: m.avatar || '',
  profile: m.profile || null,
  custom: m.custom || null,
})

async function me(device) {
  const d = await getOne('devices', { device })
  if (!d) bad('这台手机还没加入家庭')
  return d
}

// 接回某人前核对密码，连错 5 次锁 1 小时
async function checkPin(m, pin) {
  const mine = db.collection('members').where({ familyId: m.familyId, memberId: m.memberId })
  if ((m.pinLockUntil || 0) > Date.now()) bad(LOCKED)
  // 先记一次尝试再比对，同时发很多次请求也多试不了
  await mine.update({ pinTries: _.inc(1) })
  const tries = (await getOne('members', { familyId: m.familyId, memberId: m.memberId })).pinTries
  if (tries <= MAX_TRIES && m.pinHash && isPin(pin) && pinHash(m.memberId, pin) === m.pinHash) {
    await mine.update({ pinTries: 0 })
    return
  }
  if (tries < MAX_TRIES) bad(`密码不对，还能试 ${MAX_TRIES - tries} 次`)
  await mine.update({ pinTries: 0, pinLockUntil: Date.now() + LOCK_MS })
  bad(LOCKED)
}

const action = {
  whoami: (device) => whoami(device),

  // 创建家庭：自己成为第一个成员，顺便带上豆包设置
  async createFamily(device, p) {
    if (await getOne('devices', { device })) bad('这台手机已经在一个家庭里了')
    needPin(p.pin)
    let code
    do code = newCode()
    while (await getOne('families', { code }))
    const familyId = newId()
    const memberId = newId()
    await db.collection('families').add({ familyId, code, arkKey: str(p.arkKey, 200), model: str(p.model, 100), createdAt: Date.now() })
    await db.collection('members').add({ familyId, memberId, ...cleanMember({ name: p.name, avatar: p.avatar || '', profile: p.profile || null, custom: p.custom || null }), pinHash: pinHash(memberId, p.pin), createdAt: Date.now() })
    await db.collection('devices').add({ device, familyId, memberId, createdAt: Date.now() })
    return whoami(device)
  },

  // 看邀请码对应的家庭里有谁（加入前选「我是 XX」用）
  async peekFamily(device, p) {
    const family = await getOne('families', { code: str(p.code, 8).toUpperCase() })
    if (!family) bad('邀请码不对，找发链接的人再要一次')
    const members = await getAll('members', { familyId: family.familyId })
    members.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    return { members: members.map((m) => ({ memberId: m.memberId, name: m.name, avatar: m.avatar || '' })) }
  },

  // 加入家庭：memberId 有值 = 我是这个人（换手机接回），否则新建成员
  async joinFamily(device, p) {
    const family = await getOne('families', { code: str(p.code, 8).toUpperCase() })
    if (!family) bad('邀请码不对，找发链接的人再要一次')
    let memberId = p.memberId
    if (memberId) {
      // 必须是字符串，不然传个对象进来就成了查询条件
      const m = typeof memberId === 'string' && (await getOne('members', { familyId: family.familyId, memberId }))
      if (!m) bad('找不到这个人')
      await checkPin(m, p.pin)
    } else {
      needPin(p.pin)
      memberId = newId()
      await db.collection('members').add({ familyId: family.familyId, memberId, ...cleanMember({ name: p.name, avatar: p.avatar || '', profile: null, custom: null }), pinHash: pinHash(memberId, p.pin), createdAt: Date.now() })
    }
    await db.collection('devices').where({ device }).remove()
    await db.collection('devices').add({ device, familyId: family.familyId, memberId, createdAt: Date.now() })
    return whoami(device)
  },

  async leaveFamily(device) {
    await db.collection('devices').where({ device }).remove()
    return { family: null }
  },

  // 改自己的名字、头像、身体数据和目标
  async updateMe(device, p) {
    const d = await me(device)
    await db.collection('members').where({ familyId: d.familyId, memberId: d.memberId }).update(cleanMember(p))
    return whoami(device)
  },

  // 改密码：改自己的；建家庭的人（最早加入的）还能帮别人重设
  async setPin(device, p) {
    const d = await me(device)
    needPin(p.pin)
    const memberId = p.memberId === undefined ? d.memberId : p.memberId
    if (typeof memberId !== 'string') bad('找不到这个人')
    const members = await getAll('members', { familyId: d.familyId })
    if (!members.some((m) => m.memberId === memberId)) bad('找不到这个人')
    members.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    if (memberId !== d.memberId && members[0].memberId !== d.memberId) bad('只有建家庭的人能帮别人重设密码')
    await db.collection('members').where({ familyId: d.familyId, memberId }).update({ pinHash: pinHash(memberId, p.pin), pinTries: 0, pinLockUntil: 0 })
    return { ok: true }
  },

  // 改全家共用的豆包设置
  async updateFamily(device, p) {
    const d = await me(device)
    await db.collection('families').where({ familyId: d.familyId }).update({ arkKey: str(p.arkKey, 200), model: str(p.model, 100) })
    return whoami(device)
  },

  // 上传自己的改动：体重按日期覆盖，饮食按 id 覆盖，删除的单独列出
  async push(device, p) {
    const d = await me(device)
    const key = { familyId: d.familyId, memberId: d.memberId }
    for (const w of (Array.isArray(p.weights) ? p.weights : []).slice(0, 2000)) {
      if (!isDate(w.date) || !(num(w.kg) >= 30 && num(w.kg) <= 200)) continue
      const r = await db.collection('weights').where({ ...key, date: w.date }).update({ kg: w.kg, updatedAt: Date.now() })
      if (!r.updated) await db.collection('weights').add({ ...key, date: w.date, kg: w.kg, updatedAt: Date.now() })
    }
    for (const date of (Array.isArray(p.deletedWeights) ? p.deletedWeights : []).filter(isDate)) {
      await db.collection('weights').where({ ...key, date }).remove()
    }
    for (const raw of (Array.isArray(p.meals) ? p.meals : []).slice(0, 2000)) {
      const m = cleanMeal(raw)
      const r = await db.collection('meals').where({ ...key, id: m.id }).update({ ...m, updatedAt: Date.now() })
      if (!r.updated) await db.collection('meals').add({ ...key, ...m, updatedAt: Date.now() })
    }
    for (const id of (Array.isArray(p.deletedMeals) ? p.deletedMeals : []).filter((x) => typeof x === 'string')) {
      await db.collection('meals').where({ ...key, id }).remove()
    }
    return { ok: true }
  },

  // 拉全家的数据：体重全部，饮食只要 since 之后的日期（默认最近 60 天）
  async pull(device, p) {
    const d = await me(device)
    const since = isDate(p.since) ? p.since : ''
    const weights = await getAll('weights', { familyId: d.familyId })
    const meals = await getAll('meals', since ? { familyId: d.familyId, date: _.gte(since) } : { familyId: d.familyId })
    const info = await whoami(device)
    return {
      ...info,
      weights: weights.map((w) => ({ memberId: w.memberId, date: w.date, kg: w.kg })),
      meals: meals.map((m) => ({ memberId: m.memberId, id: m.id, date: m.date, time: m.time, items: m.items, input: m.input, note: m.note, createdAt: m.createdAt })),
    }
  },
}

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' }
  let body
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}')
  } catch (e) {
    return reply(400, { error: '请求格式不对' })
  }
  if (!body || typeof body !== 'object') return reply(400, { error: '请求格式不对' })
  // 只认上面列出的操作，挡掉 constructor、__proto__ 这类自带属性
  const fn = Object.hasOwn(action, body.action) ? action[body.action] : null
  const device = typeof body.device === 'string' && /^[a-z0-9]{32}$/.test(body.device) ? body.device : ''
  if (!fn) return reply(400, { error: '没有这个操作' })
  if (!device) return reply(400, { error: '缺少设备码' })
  try {
    await ensureCollections()
    return reply(200, await fn(device, body.data || {}))
  } catch (e) {
    if (e instanceof Bad) return reply(400, { error: e.message })
    console.error(e) // 详细原因只记在云函数日志里，不发给网页
    return reply(500, { error: '服务器出错了，稍后再试' })
  }
}
