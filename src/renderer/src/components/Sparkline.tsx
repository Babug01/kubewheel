interface Props {
  points: number[]
  height?: number
  width?: number
}

export default function Sparkline({ points, height = 28, width = 110 }: Props): React.JSX.Element {
  if (points.length < 2) {
    return <svg width={width} height={height} />
  }
  const stepX = width / (points.length - 1)
  const y = (v: number): number => height - (Math.min(100, Math.max(0, v)) / 100) * height
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={areaPath} fill="currentColor" opacity={0.12} stroke="none" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
