import { describe, expect, it } from 'vitest'
import { computeNotionContentUpdates, stripVolatileUrlSignatures } from './notion-content-edits'

function apply(base: string, updates: ReturnType<typeof computeNotionContentUpdates>): string {
  return updates.reduce((content, update) => {
    expect(content.split(update.old_str)).toHaveLength(2)
    return content.replace(update.old_str, update.new_str)
  }, base)
}

const IMAGE =
  '![](https://prod-files-secure.s3.amazonaws.com/a/b.png?X-Amz-Date=1&X-Amz-Signature=abc)'

describe('computeNotionContentUpdates', () => {
  it('returns nothing when unchanged', () => {
    expect(computeNotionContentUpdates('a\nb', 'a\nb')).toEqual([])
  })

  it('sends only the edited line', () => {
    const base = ['## Context', 'Old sentence', IMAGE, '## QA'].join('\n')
    const next = base.replace('Old sentence', 'New sentence')
    const updates = computeNotionContentUpdates(base, next)
    expect(updates).toEqual([{ old_str: 'Old sentence', new_str: 'New sentence' }])
    expect(apply(base, updates)).toBe(next)
  })

  it('anchors inserts and deletes on a unique neighbouring line', () => {
    const base = ['## A', '- [ ] one', '## B', '- [ ] one'].join('\n')
    const inserted = ['## A', '- [ ] one', '- [ ] two', '## B', '- [ ] one'].join('\n')
    expect(apply(base, computeNotionContentUpdates(base, inserted))).toBe(inserted)
    const deleted = ['## A', '## B', '- [ ] one'].join('\n')
    expect(apply(base, computeNotionContentUpdates(base, deleted))).toBe(deleted)
  })

  it('never uses a signed image line as context when a stable line exists', () => {
    const base = ['Intro', IMAGE, 'x'].join('\n')
    const next = ['Intro', IMAGE, 'x', 'y'].join('\n')
    const updates = computeNotionContentUpdates(base, next)
    expect(updates.every((update) => !update.old_str.includes('X-Amz'))).toBe(true)
    expect(apply(base, updates)).toBe(next)
  })

  it('keeps separate edits as separate operations', () => {
    const base = ['one', 'two', 'three', 'four', 'five'].join('\n')
    const next = ['ONE', 'two', 'three', 'four', 'FIVE'].join('\n')
    const updates = computeNotionContentUpdates(base, next)
    expect(updates).toHaveLength(2)
    expect(apply(base, updates)).toBe(next)
  })
})

describe('stripVolatileUrlSignatures', () => {
  it('treats re-signed file URLs as the same content', () => {
    const resigned = IMAGE.replace(
      'X-Amz-Date=1&X-Amz-Signature=abc',
      'X-Amz-Date=2&X-Amz-Signature=def'
    )
    expect(stripVolatileUrlSignatures(resigned)).toBe(stripVolatileUrlSignatures(IMAGE))
  })
})
