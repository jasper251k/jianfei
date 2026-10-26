import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 发布在 jasper251k.github.io/jianfei/ 下
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jianfei/' : '/',
  plugins: [react()],
  // 设置页最下面显示，看手机上是不是最新版
  define: { __BUILD__: JSON.stringify(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).slice(5, -3)) },
}))
