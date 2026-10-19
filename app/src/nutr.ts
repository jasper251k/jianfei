import type { Nutr } from './db'

const g = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

export const fmtNutr = (n: Nutr) => `蛋白 ${g(n.protein)}g · 碳水 ${g(n.carbs)}g · 脂肪 ${g(n.fat)}g`
