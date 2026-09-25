import net from 'node:net'

export const MAX_ALLOCATED_PORTS = 64

function listenOnEphemeralPort(): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, () => resolve(server))
  })
}

/**
 * Asks the OS for `count` distinct free TCP ports. Every probe server stays
 * open until all are picked so the OS cannot hand the same port out twice.
 */
export async function allocateLocalFreePorts(count: number): Promise<number[]> {
  const wanted = Math.max(0, Math.min(MAX_ALLOCATED_PORTS, Math.floor(count)))
  const servers: net.Server[] = []
  try {
    for (let i = 0; i < wanted; i++) {
      servers.push(await listenOnEphemeralPort())
    }
    return servers.map((server) => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Could not read allocated port')
      }
      return address.port
    })
  } finally {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
    )
  }
}
