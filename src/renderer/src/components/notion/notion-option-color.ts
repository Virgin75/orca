import type React from 'react'
import type { NotionOptionColor } from '../../../../shared/notion-types'

// Why: provider-supplied option colors, like Linear state colors; mid tones read on light and dark.
const NOTION_OPTION_HEX: Record<NotionOptionColor, string> = {
  default: '#9b9a97',
  gray: '#9b9a97',
  brown: '#a27763',
  orange: '#d9730d',
  yellow: '#cb912f',
  green: '#448361',
  blue: '#337ea9',
  purple: '#9065b0',
  pink: '#c14c8a',
  red: '#d44c47'
}

export function notionOptionDotStyle(color: NotionOptionColor): React.CSSProperties {
  return { backgroundColor: NOTION_OPTION_HEX[color] }
}

export function notionOptionTextStyle(color: NotionOptionColor): React.CSSProperties {
  return { color: `color-mix(in srgb, ${NOTION_OPTION_HEX[color]} 85%, var(--foreground))` }
}

export function notionOptionBadgeStyle(color: NotionOptionColor): React.CSSProperties {
  const hex = NOTION_OPTION_HEX[color]
  return {
    color: `color-mix(in srgb, ${hex} 75%, var(--foreground))`,
    backgroundColor: `color-mix(in srgb, ${hex} 16%, transparent)`,
    borderColor: `color-mix(in srgb, ${hex} 35%, transparent)`
  }
}

/** Notion's yellow comment highlight for text anchored to a discussion. */
export function notionDiscussionHighlightStyle(): React.CSSProperties {
  const hex = NOTION_OPTION_HEX.yellow
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 22%, transparent)`,
    borderBottom: `2px solid color-mix(in srgb, ${hex} 70%, transparent)`
  }
}
