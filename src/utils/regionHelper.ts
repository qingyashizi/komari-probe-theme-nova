import { emojiToRegionMap } from '@/utils/regionData'

export { emojiToRegionMap }

interface RegionEntry { emoji: string, en: string, zh: string, code: string, aliases: string[] }

const CJK_UNIFIED_IDEOGRAPH_REGEX = /\p{Script=Han}/u

function getRegionEntry(region: string | null | undefined): RegionEntry | null {
  if (!region?.trim())
    return null

  const trimmed = region.trim()
  const direct = emojiToRegionMap[trimmed]
  if (direct)
    return { emoji: trimmed, en: direct.en, zh: direct.zh, code: direct.code, aliases: direct.aliases }

  const lowerRegion = trimmed.toLowerCase()
  for (const [emoji, info] of Object.entries(emojiToRegionMap)) {
    if (info.code.toLowerCase() === lowerRegion || info.aliases.some(alias => alias.toLowerCase() === lowerRegion))
      return { emoji, en: info.en, zh: info.zh, code: info.code, aliases: info.aliases }
  }

  return null
}

/**
 * 检查地区emoji是否匹配搜索词
 * @param regionEmoji 地区emoji（如：🇭🇰）
 * @param searchTerm 搜索词
 * @returns 是否匹配
 */
export function isRegionMatch(regionEmoji: string, searchTerm: string): boolean {
  const lowerSearchTerm = searchTerm.toLowerCase().trim()

  // 直接匹配emoji / 原始值，保留未知地区的搜索能力
  if (regionEmoji === searchTerm)
    return true

  const regionInfo = getRegionEntry(regionEmoji)
  if (!regionInfo)
    return regionEmoji.toLowerCase().includes(lowerSearchTerm)

  // 检查英文名称
  if (regionInfo.en.toLowerCase().includes(lowerSearchTerm))
    return true

  // 检查中文名称
  if (regionInfo.zh.includes(lowerSearchTerm))
    return true

  // 检查别名
  return regionInfo.aliases.some(alias =>
    alias.toLowerCase().includes(lowerSearchTerm),
  )
}

/**
 * 获取地区的显示名称
 * @param regionEmoji 地区emoji
 * @param language 语言 ('en' | 'zh')
 * @returns 地区名称
 */
export function getRegionDisplayName(regionEmoji: string, language: 'en' | 'zh' = 'zh'): string {
  const regionInfo = getRegionEntry(regionEmoji)
  if (!regionInfo)
    return ''

  if (language === 'en')
    return regionInfo.en

  return CJK_UNIFIED_IDEOGRAPH_REGEX.test(regionInfo.zh) ? regionInfo.zh : ''
}

/**
 * 获取地区代码
 * @param regionEmoji 地区emoji
 * @returns 地区代码（如：HK, CN, US）
 */
export function getRegionCode(regionEmoji: string): string {
  const regionInfo = getRegionEntry(regionEmoji)
  if (!regionInfo)
    return regionEmoji

  return regionInfo.code
}
