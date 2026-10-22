// 日期一律用本地 YYYY-MM-DD 字符串

const pad = (n: number) => String(n).padStart(2, '0')

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => ymd(new Date())

// 现在几点：HH:MM
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5)

export const md = (s: string) => `${Number(s.slice(5, 7))}月${Number(s.slice(8))}日`

// 0 = 周一 … 6 = 周日
export const weekday = (s: string) => (toDate(s).getDay() + 6) % 7

export const mondayOf = (s: string) => addDays(s, -weekday(s))
