import type React from 'react'

/** GitHub-style label badge from the label's repo color (hex without `#`); legible in both themes. */
export function githubLabelBadgeStyle(hex: string): React.CSSProperties {
  const color = `#${hex}`
  return {
    color: `color-mix(in srgb, ${color} 70%, var(--foreground))`,
    backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 45%, transparent)`
  }
}
