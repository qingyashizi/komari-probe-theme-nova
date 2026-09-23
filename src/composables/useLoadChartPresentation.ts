import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

export function useLoadChartPresentation(isDark: MaybeRefOrGetter<boolean>) {
  const chartThemeColors = computed(() => {
    const dark = toValue(isDark)
    return {
      text: dark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
      textSecondary: dark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
      textTertiary: dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
      borderColor: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      splitLineColor: dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      tooltipBg: dark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
      tooltipShadow: dark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
      crosshairColor: dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
    }
  })
  const baseTooltipConfig = computed(() => ({
    trigger: 'axis' as const,
    confine: false,
    backgroundColor: chartThemeColors.value.tooltipBg,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 6,
    textStyle: { color: chartThemeColors.value.text, fontSize: 12, lineHeight: 20 },
    extraCssText: `backdrop-filter: blur(5px);z-index:9;box-shadow:0 0 0 1px ${chartThemeColors.value.tooltipShadow}, 0 0 16px ${chartThemeColors.value.tooltipShadow}`,
    axisPointer: {
      type: 'cross' as const,
      crossStyle: { color: chartThemeColors.value.textTertiary },
      lineStyle: { color: chartThemeColors.value.crosshairColor, width: 1, type: 'dashed' as const },
      shadowStyle: { color: chartThemeColors.value.crosshairColor },
    },
  }))
  return { chartThemeColors, baseTooltipConfig }
}
