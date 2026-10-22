import type { Item, Nutr } from './db'
import type { Profile } from './target'

// 云函数 api 的 HTTP 地址（腾讯云开发，见 cloud/functions/api）
const API = 'https://jaspercloud-d8ghkbza1c53ca352-1511368278.ap-shanghai.app.tcloudbase.com/api'

// 每台手机一个随机设备码，云端靠它认出是谁
export function deviceId() {
  let id = ''
  try {
    id = localStorage.getItem('device') ?? ''
    if (!/^[a-z0-9]{32}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem('device', id)
    }
  } catch {
    // 存不了就每次新生成；这种情况下加入家庭后下次打开会认不出，页面会提示重新加入
  }
  return id
}

export type Member = { memberId: string; name: string; avatar: string; profile: Profile | null; custom: Nutr | null }
export type Family = { familyId: string; code: string; arkKey: string; model: string }
export type Who = { family: Family | null; memberId?: string; members?: Member[] }

export type CloudWeight = { memberId: string; date: string; kg: number }
export type CloudMeal = {
  memberId: string
  id: string
  date: string
  time: string
  items: Item[]
  input?: string
  note?: string
  createdAt: number
}
export type Pulled = Who & { weights: CloudWeight[]; meals: CloudMeal[] }

async function call<T>(action: string, data: unknown = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, device: deviceId(), data }),
    })
  } catch {
    throw new Error('连不上云端，检查一下网络')
  }
  let body: { error?: string } & T
  try {
    body = await res.json()
  } catch {
    throw new Error(`云端出错了（${res.status}）`)
  }
  if (!res.ok) throw new Error(body.error || `云端出错了（${res.status}）`)
  return body
}

export const cloud = {
  whoami: () => call<Who>('whoami'),
  createFamily: (d: { name: string; avatar: string; pin: string; arkKey: string; model: string; profile?: Profile; custom?: Nutr }) =>
    call<Who>('createFamily', d),
  peekFamily: (code: string) => call<{ members: Pick<Member, 'memberId' | 'name' | 'avatar'>[] }>('peekFamily', { code }),
  joinFamily: (d: { code: string; pin: string; memberId?: string; name?: string; avatar?: string }) => call<Who>('joinFamily', d),
  // 不带 memberId 改自己的；建家庭的人带上别人的 memberId 帮他重设
  setPin: (pin: string, memberId?: string) => call<{ ok: true }>('setPin', { pin, memberId }),
  leaveFamily: () => call<Who>('leaveFamily'),
  updateMe: (d: Partial<Pick<Member, 'name' | 'avatar' | 'profile' | 'custom'>>) => call<Who>('updateMe', d),
  updateFamily: (d: { arkKey: string; model: string }) => call<Who>('updateFamily', d),
  push: (d: {
    weights?: { date: string; kg: number }[]
    deletedWeights?: string[]
    meals?: Omit<CloudMeal, 'memberId'>[]
    deletedMeals?: string[]
  }) => call<{ ok: true }>('push', d),
  pull: (since?: string) => call<Pulled>('pull', { since }),
}
