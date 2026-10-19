import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 发布在 jasper251k.github.io/jianfei/ 下
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jianfei/' : '/',
  plugins: [react()],
}))
