import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

/**
 * 复用 useNodePingDisplay.ts 里已经定的延迟/丢包 5 档分级阈值（60/100/160/200ms、
 * 1/3/6/9%），保证这张地图跟节点卡片上的信号灯颜色含义一致；波动率这个指标在
 * 别处还没有分级标准，这里先给一个参考阈值。
 */
export type ChinaLatencyMetric = 'latency' | 'loss' | 'volatility'

export interface MetricPiece {
  min: number
  max: number
  label: string
}

const METRIC_PIECES: Record<ChinaLatencyMetric, MetricPiece[]> = {
  latency: [
    { min: 0, max: 60, label: '≤60ms' },
    { min: 60, max: 100, label: '60-100ms' },
    { min: 100, max: 160, label: '100-160ms' },
    { min: 160, max: 200, label: '160-200ms' },
    { min: 200, max: Number.POSITIVE_INFINITY, label: '>200ms' },
  ],
  loss: [
    { min: 0, max: 1, label: '≤1%' },
    { min: 1, max: 3, label: '1-3%' },
    { min: 3, max: 6, label: '3-6%' },
    { min: 6, max: 9, label: '6-9%' },
    { min: 9, max: Number.POSITIVE_INFINITY, label: '>9%' },
  ],
  volatility: [
    { min: 0, max: 1.3, label: '1.0-1.3' },
    { min: 1.3, max: 1.8, label: '1.3-1.8' },
    { min: 1.8, max: 2.5, label: '1.8-2.5' },
    { min: 2.5, max: 3.5, label: '2.5-3.5' },
    { min: 3.5, max: Number.POSITIVE_INFINITY, label: '>3.5' },
  ],
}

// 第4档（黄）和第5档（红）没有直接用共享的 --signal-4/--signal-5（那两个是偏柔和的黄绿色/
// 玫红色，适合小圆点/文字场景），地图这种大色块场景需要红黄蓝式的清晰警示色阶，所以这两档
// 单独调成更饱和的琥珀黄和纯红，前三档跟全局信号灯配色保持一致。色盲友好模式本身就刻意
// 避开纯红黄（红绿难分），不做调整。
const SIGNAL_COLORS = {
  default: { light: ['#059669', '#4ade80', '#a3e635', '#f59e0b', '#ef4444'], dark: ['#10b981', '#4ade80', '#a3e635', '#fbbf24', '#ef4444'] },
  colorVisionFriendly: { light: ['#0072b2', '#56b4e9', '#009e73', '#e69f00', '#d55e00'], dark: ['#56b4e9', '#9bd7f0', '#44c7a0', '#e69f00', '#f28e5b'] },
} as const

export function useChinaLatencyMapPresentation(isDark: MaybeRefOrGetter<boolean>, colorVisionFriendly: MaybeRefOrGetter<boolean>) {
  const signalColors = computed(() => {
    const palette = toValue(colorVisionFriendly) ? SIGNAL_COLORS.colorVisionFriendly : SIGNAL_COLORS.default
    return toValue(isDark) ? palette.dark : palette.light
  })

  function piecesFor(metric: ChinaLatencyMetric) {
    return METRIC_PIECES[metric].map((piece, index) => ({
      min: piece.min,
      max: piece.max,
      label: piece.label,
      color: signalColors.value[index],
    }))
  }

  function colorForValue(metric: ChinaLatencyMetric, value: number): string {
    const pieces = METRIC_PIECES[metric]
    const index = pieces.findIndex(piece => value >= piece.min && value < piece.max)
    return signalColors.value[index === -1 ? pieces.length - 1 : index] ?? signalColors.value.at(-1)!
  }

  const chartTheme = computed(() => {
    const dark = toValue(isDark)
    return {
      text: dark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
      textSecondary: dark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
      borderColor: dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
      areaBorder: dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.9)',
      noDataArea: dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
      emphasisArea: dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(37, 99, 235, 0.35)',
      tooltipBg: dark ? 'rgba(40, 40, 40, 0.9)' : 'rgba(255, 255, 255, 0.82)',
      tooltipShadow: dark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.08)',
    }
  })

  return { signalColors, piecesFor, colorForValue, chartTheme }
}
