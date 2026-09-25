import { describe, expect, it } from 'vitest'
import { allocateLocalFreePorts } from './local-free-ports'

describe('allocateLocalFreePorts', () => {
  it('returns the requested number of distinct ports', async () => {
    const ports = await allocateLocalFreePorts(5)
    expect(ports).toHaveLength(5)
    expect(new Set(ports).size).toBe(5)
    for (const port of ports) {
      expect(port).toBeGreaterThan(0)
    }
  })

  it('clamps negative counts to zero', async () => {
    await expect(allocateLocalFreePorts(-3)).resolves.toEqual([])
  })
})
