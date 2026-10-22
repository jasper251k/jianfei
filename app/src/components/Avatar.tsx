// 成员头像：有照片用照片，没有就用名字第一个字 + 成员颜色
export default function Avatar({ name, src, color, size = 40 }: { name: string; src?: string; color: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (src) return <img className="avatar" src={src} alt="" style={style} />
  return (
    <span className="avatar" style={{ ...style, background: color }}>
      {name.slice(0, 1)}
    </span>
  )
}

// 全家对比图的颜色，按加入顺序分配，同一个人永远同一个颜色（已用 dataviz 校验过色盲区分）
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6']
export const memberColor = (index: number) => COLORS[index % COLORS.length]
