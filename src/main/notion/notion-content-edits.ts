/** One `update_content` search-and-replace operation for Notion's update-page tool. */
export type NotionContentUpdate = { old_str: string; new_str: string }

type Hunk = { start: number; end: number; replacement: string[] }

const MAX_UPDATES = 100
const MAX_DIFF_CELLS = 4_000_000
// Signed file URLs (images, attachments) are re-signed on every fetch.
const SIGNED_URL_QUERY = /\?[^\s)"]*X-Amz-Signature=[^\s)"]*/g

/** Content with per-fetch URL signatures removed, for "did the page change?" checks. */
export function stripVolatileUrlSignatures(content: string): string {
  return content.replace(SIGNED_URL_QUERY, '')
}

function isVolatileLine(line: string | undefined): boolean {
  return line !== undefined && line.includes('X-Amz-Signature=')
}

/**
 * Turns an edited page into minimal line-level search/replace operations.
 *
 * Why not replace the whole page: untouched blocks (images carry short-lived signed URLs,
 * child pages, synced blocks) must never be rewritten, so only changed lines are sent,
 * widened with context until each `old_str` occurs exactly once in the base.
 */
export function computeNotionContentUpdates(base: string, next: string): NotionContentUpdate[] {
  if (base === next) {
    return []
  }
  const baseLines = base.split('\n')
  const nextLines = next.split('\n')
  let hunks = diffHunks(baseLines, nextLines)
  if (hunks.length > MAX_UPDATES) {
    hunks = [mergeHunks(baseLines, hunks)]
  }
  let expanded = hunks.map((hunk) => expand(baseLines, base, hunk))
  // Why: context widening can make neighbours overlap; merge them and widen again.
  for (let index = 1; index < expanded.length; index++) {
    if (expanded[index].start < expanded[index - 1].end) {
      const merged = mergeHunks(baseLines, [hunks[index - 1], hunks[index]])
      hunks.splice(index - 1, 2, merged)
      expanded = hunks.map((hunk) => expand(baseLines, base, hunk))
      index = 0
    }
  }
  return expanded.map((hunk) => ({
    old_str: baseLines.slice(hunk.start, hunk.end).join('\n'),
    new_str: hunk.replacement.join('\n')
  }))
}

function diffHunks(a: string[], b: string[]): Hunk[] {
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++
  }
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++
  }
  const midA = a.slice(prefix, a.length - suffix)
  const midB = b.slice(prefix, b.length - suffix)
  if (midA.length * midB.length > MAX_DIFF_CELLS) {
    return [{ start: prefix, end: a.length - suffix, replacement: midB }]
  }
  // LCS table over the changed middle only.
  const cols = midB.length + 1
  const lcs = new Uint32Array((midA.length + 1) * cols)
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1])
    }
  }
  const hunks: Hunk[] = []
  let current: Hunk | null = null
  let i = 0
  let j = 0
  const flush = (): void => {
    if (current) {
      hunks.push(current)
      current = null
    }
  }
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      flush()
      i++
      j++
      continue
    }
    current ??= { start: prefix + i, end: prefix + i, replacement: [] }
    if (
      j < midB.length &&
      (i === midA.length || lcs[i * cols + j + 1] >= lcs[(i + 1) * cols + j])
    ) {
      current.replacement.push(midB[j])
      j++
    } else {
      i++
      current.end = prefix + i
    }
  }
  flush()
  return hunks
}

function mergeHunks(baseLines: string[], hunks: Hunk[]): Hunk {
  const first = hunks[0]
  const replacement = [...first.replacement]
  let cursor = first.end
  for (const hunk of hunks.slice(1)) {
    replacement.push(...baseLines.slice(cursor, hunk.start), ...hunk.replacement)
    cursor = hunk.end
  }
  return { start: first.start, end: cursor, replacement }
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1 && count < 2) {
    count++
    index = haystack.indexOf(needle, index + 1)
  }
  return count
}

function expand(baseLines: string[], base: string, hunk: Hunk): Hunk {
  let { start, end } = hunk
  const replacement = [...hunk.replacement]
  const oldText = (): string => baseLines.slice(start, end).join('\n')
  // Pure inserts/deletes need an anchor line; ambiguous matches need more context.
  while (
    (end === start ||
      replacement.length === 0 ||
      oldText().trim() === '' ||
      countOccurrences(base, oldText()) !== 1) &&
    (start > 0 || end < baseLines.length)
  ) {
    // Prefer anchoring on stable lines: signed URLs never match the server's copy.
    const canGrowUp = start > 0
    const canGrowDown = end < baseLines.length
    const growUp =
      canGrowUp &&
      (!isVolatileLine(baseLines[start - 1]) || !canGrowDown || isVolatileLine(baseLines[end]))
    if (growUp) {
      start--
      replacement.unshift(baseLines[start])
    } else {
      replacement.push(baseLines[end])
      end++
    }
  }
  return { start, end, replacement }
}
