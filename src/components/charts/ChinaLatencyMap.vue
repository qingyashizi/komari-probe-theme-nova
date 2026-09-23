<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useChinaLatencyMap } from '@/composables/useChinaLatencyMap'
import { useChinaLatencyMapPresentation } from '@/composables/useChinaLatencyMapPresentation'
import { useAppStore } from '@/stores/app'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
  name: string
}>()

// 台湾/香港/澳门/南海诸岛/十段线不在内置探测省份目录里，不会出现在 seriesData
// 里，如果不显式给它们上色，ECharts 会用自己的默认区域色——这个默认色在深色
// 仪表盘背景下还看得清，但导出图片背景强制是纯白，默认色跟白底几乎融为一体，
// 整块区域直接"消失"。十段线是 MultiLineString，画不出面颜色，只给边框。
const AUX_REGION_NAMES = ['台湾', '香港', '澳门', '南海诸岛', '十段线'] as const
const AUX_LINE_NAMES = new Set(['十段线'])

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const colorVisionFriendly = computed(() => appStore.colorVisionFriendly)
const siteName = computed(() => appStore.publicSettings?.sitename || 'Komari Monitor')

const { chartTheme, piecesFor, colorForValue } = useChinaLatencyMapPresentation(isDark, colorVisionFriendly)
const { data, loading, error } = useChinaLatencyMap(() => props.uuid)

type CarrierView = 'overview' | string
const selectedCarrier = ref<CarrierView>('overview')
const selectedMetric = ref<'latency' | 'loss' | 'volatility'>('latency')
const showValues = ref(false)

const METRIC_OPTIONS = [
  { key: 'latency' as const, label: '延迟' },
  { key: 'loss' as const, label: '丢包率' },
  { key: 'volatility' as const, label: '波动率' },
]
const metricUnit = computed(() => ({ latency: 'ms', loss: '%', volatility: 'x' }[selectedMetric.value]))

let geoJson: Record<string, unknown> | null = null
const geoJsonReady = ref(false)
const geoJsonError = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await fetch('/data/china-map.json')
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`)
    geoJson = await res.json()
    const echartsCore = await import('echarts/core')
    echartsCore.registerMap('china', geoJson as any)
    geoJsonReady.value = true
  }
  catch (err) {
    geoJsonError.value = err instanceof Error ? err.message : '地图数据加载失败'
  }
})

// 内置节点最优线路：总览时取三网里延迟最低的那一个作为该省的代表值
function bestCarrierCode(carriers: Partial<Record<string, { latency?: number, loss: number, volatility?: number }>>): string | null {
  let best: string | null = null
  let bestLatency = Number.POSITIVE_INFINITY
  for (const code of Object.keys(carriers)) {
    const latency = carriers[code]?.latency
    if (latency !== undefined && latency < bestLatency) {
      bestLatency = latency
      best = code
    }
  }
  return best
}

function valueForProvince(code: string): number | undefined {
  const province = data.value?.provinceData.get(code)
  if (!province)
    return undefined
  const carrierCode = selectedCarrier.value === 'overview' ? bestCarrierCode(province.carriers) : selectedCarrier.value
  if (!carrierCode)
    return undefined
  return province.carriers[carrierCode]?.[selectedMetric.value]
}

function tooltipHtml(provinceCode: string): string {
  const province = data.value?.provinceData.get(provinceCode)
  const theme = chartTheme.value
  if (!province || Object.keys(province.carriers).length === 0) {
    return `<div style="font-weight:700;margin-bottom:2px;color:${theme.text}">${province?.name ?? ''}</div>
      <div style="font-size:11px;color:${theme.textSecondary}">暂无监测数据</div>`
  }
  const bestCode = bestCarrierCode(province.carriers)
  const rows = (data.value?.carriers ?? []).map((carrier) => {
    const cell = province.carriers[carrier.code]
    if (!cell)
      return ''
    const isBest = selectedCarrier.value === 'overview' && carrier.code === bestCode
    const rowColor = isBest ? theme.text : theme.textSecondary
    const star = isBest ? ' ★' : ''
    const latencyText = cell.latency !== undefined ? `${Math.round(cell.latency)}ms` : '-'
    return `<div style="display:flex;justify-content:space-between;gap:16px;color:${rowColor};font-weight:${isBest ? 700 : 400}">
      <span>${carrier.name}${star}</span>
      <span>${latencyText} · 丢包${cell.loss.toFixed(1)}%${cell.volatility !== undefined ? ` · 波动${cell.volatility.toFixed(2)}x` : ''}</span>
    </div>`
  }).join('')
  return `<div style="font-weight:700;margin-bottom:6px;color:${theme.text}">${province.name}</div>${rows}`
}

const chartOption = shallowRef<Record<string, unknown>>({})

function buildOption() {
  if (!data.value || !geoJsonReady.value) {
    chartOption.value = {}
    return
  }
  const theme = chartTheme.value
  const provinces = data.value.provinces

  const seriesData = provinces.map((province) => {
    const value = valueForProvince(province.code)
    if (value === undefined) {
      return {
        name: province.name,
        value: undefined,
        itemStyle: { areaColor: theme.noDataArea, borderColor: theme.areaBorder } as { areaColor?: string, borderColor: string },
      }
    }
    return {
      name: province.name,
      value,
      itemStyle: { areaColor: colorForValue(selectedMetric.value, value), borderColor: theme.areaBorder } as { areaColor?: string, borderColor: string },
    }
  })

  for (const name of AUX_REGION_NAMES) {
    seriesData.push({
      name,
      value: undefined,
      itemStyle: AUX_LINE_NAMES.has(name)
        ? { borderColor: theme.areaBorder }
        : { areaColor: theme.noDataArea, borderColor: theme.areaBorder },
    })
  }

  chartOption.value = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.tooltipBg,
      borderWidth: 0,
      extraCssText: `backdrop-filter: blur(5px); box-shadow: 0 0 0 1px ${theme.tooltipShadow}, 0 4px 16px ${theme.tooltipShadow};`,
      textStyle: { color: theme.text, fontSize: 12 },
      formatter: (params: any) => (params.name ? tooltipHtml(provinces.find(p => p.name === params.name)?.code ?? '') : ''),
    },
    visualMap: {
      type: 'piecewise',
      show: false,
      pieces: piecesFor(selectedMetric.value),
    },
    series: [
      {
        type: 'map',
        map: 'china',
        roam: true,
        label: {
          show: showValues.value,
          fontSize: 10,
          color: theme.text,
          formatter: (params: any) => {
            const v = params.value
            return Number.isFinite(v) ? `${Math.round(v * 100) / 100}${metricUnit.value}` : ''
          },
        },
        emphasis: {
          label: { show: true, color: theme.text },
          itemStyle: { areaColor: theme.emphasisArea },
        },
        itemStyle: { borderColor: theme.areaBorder, borderWidth: 1 },
        data: seriesData,
      },
    ],
  }
}

const legendPieces = computed(() => piecesFor(selectedMetric.value))

watch(
  [data, selectedCarrier, selectedMetric, showValues, geoJsonReady, isDark, colorVisionFriendly],
  buildOption,
  { immediate: true },
)

const exporting = ref(false)

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function pillWidth(ctx: CanvasRenderingContext2D, text: string, paddingX: number): number {
  return ctx.measureText(text).width + paddingX * 2
}

function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, centerY: number, height: number, bg: string, color: string, paddingX: number): number {
  const w = pillWidth(ctx, text, paddingX)
  roundRectPath(ctx, x, centerY - height / 2, w, height, height / 2)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + paddingX, centerY)
  return w
}

function formatExportTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function exportImage() {
  if (!data.value || !geoJsonReady.value || exporting.value)
    return
  exporting.value = true
  try {
    const echartsCore = await import('echarts/core')
    const metric = selectedMetric.value
    const lightTheme = useChinaLatencyMapPresentation(ref(false), colorVisionFriendly)
    const provinces = data.value.provinces

    const seriesData = provinces.map((province) => {
      const value = valueForProvince(province.code)
      if (value === undefined)
        return { name: province.name, value: undefined, itemStyle: { areaColor: '#f1f2f4', borderColor: '#ffffff' } as { areaColor?: string, borderColor: string } }
      return { name: province.name, value, itemStyle: { areaColor: lightTheme.colorForValue(metric, value), borderColor: '#ffffff' } as { areaColor?: string, borderColor: string } }
    })

    for (const name of AUX_REGION_NAMES) {
      seriesData.push({
        name,
        value: undefined,
        itemStyle: AUX_LINE_NAMES.has(name)
          ? { borderColor: '#d1d5db' }
          : { areaColor: '#f1f2f4', borderColor: '#d1d5db' },
      })
    }

    const chartWidth = 860
    const chartHeight = 520
    const container = document.createElement('div')
    container.style.cssText = `position:fixed;left:-9999px;top:0;width:${chartWidth}px;height:${chartHeight}px;`
    document.body.appendChild(container)

    const chart = echartsCore.init(container, undefined, { width: chartWidth, height: chartHeight })
    chart.setOption({
      backgroundColor: '#ffffff',
      series: [{
        type: 'map',
        map: 'china',
        roam: false,
        silent: true,
        left: 'center',
        top: 'middle',
        label: {
          show: showValues.value,
          fontSize: 10,
          color: '#1f2937',
          formatter: (params: any) => {
            const v = params.value
            return Number.isFinite(v) ? `${Math.round(v * 100) / 100}${metricUnit.value}` : ''
          },
        },
        itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
        data: seriesData,
      }],
    })
    await new Promise(resolve => requestAnimationFrame(resolve))
    const mapDataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    chart.dispose()
    document.body.removeChild(container)

    const [mapImg, logoImg] = await Promise.all([
      loadImage(mapDataUrl),
      loadImage('/images/logo/probe-logo.svg').catch(() => null),
    ])

    const pieces = lightTheme.piecesFor(metric)
    const padding = 20
    const headerHeight = 60
    const legendHeight = 40
    const width = chartWidth + padding * 2
    const height = headerHeight + chartHeight + legendHeight + padding
    const scale = 2

    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    // 表头：左-Sonar 图标+站点名，中-服务器名+运营商/指标徽标（水平居中于整行），右-时间
    const headerCenterY = headerHeight / 2
    let leftX = padding
    if (logoImg) {
      ctx.drawImage(logoImg, leftX, headerCenterY - 12, 24, 24)
      leftX += 24 + 8
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#111827'
    ctx.font = '600 15px -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    ctx.fillText(siteName.value, leftX, headerCenterY)

    ctx.font = '400 12px -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    ctx.fillStyle = '#6b7280'
    const timeText = formatExportTime(new Date())
    const timeWidth = ctx.measureText(timeText).width
    ctx.textAlign = 'left'
    ctx.fillText(timeText, width - padding - timeWidth, headerCenterY)

    const carrierLabel = selectedCarrier.value === 'overview'
      ? '总览'
      : data.value.carriers.find(c => c.code === selectedCarrier.value)?.name ?? selectedCarrier.value
    const metricLabel = METRIC_OPTIONS.find(m => m.key === metric)?.label ?? ''
    const badgeHeight = 22
    const badgePaddingX = 10
    const gap = 8

    ctx.font = '600 14px -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    const serverNameWidth = ctx.measureText(props.name).width
    ctx.font = '600 12px -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    const carrierPillWidth = pillWidth(ctx, carrierLabel, badgePaddingX)
    const metricPillWidth = pillWidth(ctx, metricLabel, badgePaddingX)
    const clusterWidth = serverNameWidth + gap + carrierPillWidth + gap + metricPillWidth
    let clusterX = (width - clusterWidth) / 2

    ctx.font = '600 14px -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    ctx.fillStyle = '#111827'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(props.name, clusterX, headerCenterY)
    clusterX += serverNameWidth + gap

    ctx.font = '600 12px -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    clusterX += drawPill(ctx, carrierLabel, clusterX, headerCenterY, badgeHeight, 'rgba(0,0,0,0.06)', '#374151', badgePaddingX) + gap
    drawPill(ctx, metricLabel, clusterX, headerCenterY, badgeHeight, 'rgba(5,150,105,0.12)', '#059669', badgePaddingX)

    ctx.strokeStyle = 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, headerHeight)
    ctx.lineTo(width, headerHeight)
    ctx.stroke()

    ctx.drawImage(mapImg, padding, headerHeight, chartWidth, chartHeight)

    // 图例：色块+文字，整体水平居中
    ctx.font = '400 11px -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    const swatchSize = 10
    const legendGap = 18
    const legendItemGap = 6
    const legendWidths = pieces.map(piece => swatchSize + legendItemGap + ctx.measureText(piece.label).width)
    const legendTotalWidth = legendWidths.reduce((a, b) => a + b, 0) + legendGap * (pieces.length - 1)
    let legendX = (width - legendTotalWidth) / 2
    const legendY = headerHeight + chartHeight + legendHeight / 2
    pieces.forEach((piece, index) => {
      ctx.fillStyle = piece.color ?? '#9ca3af'
      roundRectPath(ctx, legendX, legendY - swatchSize / 2, swatchSize, swatchSize, 2)
      ctx.fill()
      ctx.fillStyle = '#6b7280'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(piece.label, legendX + swatchSize + legendItemGap, legendY)
      legendX += (legendWidths[index] ?? 0) + legendGap
    })

    const link = document.createElement('a')
    link.download = `${siteName.value}-${props.name}-全国延迟-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }
  finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2 items-center justify-between">
      <Tabs v-model="selectedCarrier">
        <TabsList class="h-8 bg-background/50 backdrop-blur-xl rounded-md">
          <TabsTrigger value="overview" class="h-6.5 text-xs border-none data-[state=active]:text-green-600 shadow-none rounded-sm">
            总览
          </TabsTrigger>
          <TabsTrigger
            v-for="carrier in data?.carriers ?? []" :key="carrier.code" :value="carrier.code"
            class="h-6.5 text-xs border-none data-[state=active]:text-green-600 shadow-none rounded-sm"
          >
            {{ carrier.name }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="flex gap-2 items-center">
        <div class="flex gap-1 rounded-md bg-background/50 backdrop-blur-xl p-0.5">
          <Button
            v-for="metric in METRIC_OPTIONS" :key="metric.key"
            variant="ghost" size="xs" class="h-7 rounded-sm border-none"
            :class="selectedMetric === metric.key && 'shadow-[0_0_0_2px] shadow-green-600/10 text-green-600'"
            @click="selectedMetric = metric.key"
          >
            {{ metric.label }}
          </Button>
        </div>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm bg-background/50 hover:bg-background border-none"
          :class="showValues && 'shadow-[0_0_0_2px] shadow-green-600/10 text-green-600'"
          @click="showValues = !showValues"
        >
          显示数值
        </Button>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm bg-background/50 hover:bg-background border-none"
          :disabled="exporting || !data || !geoJsonReady"
          @click="exportImage"
        >
          {{ exporting ? '导出中…' : '导出图片' }}
        </Button>
      </div>
    </div>

    <Spinner :show="loading && !data" content-class="flex flex-col gap-4">
      <div v-if="error || geoJsonError" class="text-red-500 py-8 text-center">
        {{ error || geoJsonError }}
      </div>
      <Empty v-else-if="!loading && data && data.provinceData.size === 0" description="暂无延迟数据" />
      <div v-else class="h-[540px] sm:h-[640px] bg-background/50 rounded-md p-2 relative">
        <VChart :option="chartOption" autoresize class="h-full w-full" />
        <div class="absolute left-3 bottom-3 flex flex-col gap-1 rounded-md bg-background/60 backdrop-blur-xl px-2.5 py-2 text-[11px]">
          <div v-for="piece in legendPieces" :key="piece.label" class="flex gap-1.5 items-center">
            <span class="size-2.5 rounded-sm shrink-0" :style="{ backgroundColor: piece.color }" />
            <span class="text-muted-foreground">{{ piece.label }}</span>
          </div>
        </div>
      </div>
    </Spinner>
  </div>
</template>
