import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { homedir } from 'node:os'
import { spawnProcess } from '../../shared/child-process/run-process'
import { resolveCliCommand, withCliRuntimeOnPath } from '../../shared/node-cli-command-resolution'
import type { NotionConnectionStatus } from '../../shared/notion-types'

export const NOTION_MCP_URL = 'https://mcp.notion.com/mcp'
const MCP_PROTOCOL_VERSION = '2025-06-18'
// Why: first connect waits on the Notion OAuth consent page mcp-remote opens in the browser.
const INITIALIZE_TIMEOUT_MS = 5 * 60_000
const TOOL_CALL_TIMEOUT_MS = 60_000
const MAX_STDERR_TAIL = 4_000

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type JsonRpcMessage = {
  id?: number | string
  method?: string
  result?: unknown
  error?: { code?: number; message?: string }
}

type McpToolCallResult = {
  content?: { type?: string; text?: string }[]
  isError?: boolean
}

/** Stdio MCP client for Notion's hosted server, bridged through `npx mcp-remote`. */
class NotionMcpConnection {
  private child: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 0
  private stdoutBuffer = ''
  private stderrTail = ''
  private toolNames: string[] = []
  private status: NotionConnectionStatus = { state: 'idle', error: null }

  getStatus(): NotionConnectionStatus {
    return this.status
  }

  connect(): Promise<void> {
    if (!this.ready) {
      this.ready = this.start().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.status = { state: 'error', error: message }
        this.stop()
        throw error
      })
    }
    return this.ready
  }

  async callTool(suffix: string, args: Record<string, unknown>): Promise<string> {
    await this.connect()
    const name = this.resolveToolName(suffix)
    const raw = await this.request('tools/call', { name, arguments: args }, TOOL_CALL_TIMEOUT_MS)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: MCP tools/call result shape; every field is read defensively below.
    const result = (raw ?? {}) as McpToolCallResult
    const text = (result.content ?? [])
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
    if (result.isError) {
      throw new Error(text || `Notion ${suffix} failed`)
    }
    return text
  }

  stop(): void {
    const child = this.child
    this.child = null
    this.ready = null
    this.toolNames = []
    this.stdoutBuffer = ''
    for (const [id, request] of this.pending) {
      clearTimeout(request.timer)
      request.reject(new Error('Notion connection closed'))
      this.pending.delete(id)
    }
    if (child && child.exitCode === null) {
      child.kill()
    }
    if (this.status.state !== 'error') {
      this.status = { state: 'idle', error: null }
    }
  }

  private async start(): Promise<void> {
    this.status = { state: 'connecting', error: null }
    this.stderrTail = ''
    const npx = resolveCliCommand('npx')
    const child = spawnProcess({
      program: npx,
      args: ['-y', 'mcp-remote', NOTION_MCP_URL],
      cwd: homedir(),
      env: withCliRuntimeOnPath(npx, { ...process.env }),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeoutMs: null
    })
    this.child = child
    child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-MAX_STDERR_TAIL)
    })
    child.stdin.on('error', () => this.onExit(child, null))
    child.on('error', (error) => this.onExit(child, error))
    child.on('close', () => this.onExit(child, null))

    await this.request(
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'orca', version: '1.0.0' }
      },
      INITIALIZE_TIMEOUT_MS
    )
    this.write({ jsonrpc: '2.0', method: 'notifications/initialized' })
    const list = await this.request('tools/list', {}, TOOL_CALL_TIMEOUT_MS)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: MCP tools/list result; names are filtered to strings.
    const tools = ((list ?? {}) as { tools?: { name?: unknown }[] }).tools ?? []
    this.toolNames = tools
      .map((tool) => tool.name)
      .filter((n): n is string => typeof n === 'string')
    this.status = { state: 'connected', error: null }
  }

  // Why: the hosted server has shipped both `search` and `notion-search` spellings.
  private resolveToolName(suffix: string): string {
    return (
      this.toolNames.find((name) => name === `notion-${suffix}`) ??
      this.toolNames.find((name) => name === suffix) ??
      this.toolNames.find((name) => name.endsWith(suffix)) ??
      `notion-${suffix}`
    )
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Notion ${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      if (!this.write({ jsonrpc: '2.0', id, method, params })) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error('Notion connection is not running'))
      }
    })
  }

  private write(message: Record<string, unknown>): boolean {
    if (!this.child || !this.child.stdin.writable) {
      return false
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
    return true
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString()
    let newline = this.stdoutBuffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (line) {
        this.onMessage(line)
      }
      newline = this.stdoutBuffer.indexOf('\n')
    }
  }

  private onMessage(line: string): void {
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.method && message.id !== undefined) {
      // Server-initiated request (e.g. ping): answer so the bridge keeps the session alive.
      const reply =
        message.method === 'ping'
          ? { jsonrpc: '2.0', id: message.id, result: {} }
          : { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported' } }
      this.write(reply)
      return
    }
    if (typeof message.id !== 'number') {
      return
    }
    const request = this.pending.get(message.id)
    if (!request) {
      return
    }
    this.pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) {
      request.reject(new Error(message.error.message ?? 'Notion request failed'))
    } else {
      request.resolve(message.result)
    }
  }

  private onExit(child: ChildProcessWithoutNullStreams, error: Error | null): void {
    if (this.child !== child) {
      return
    }
    const detail = error?.message ?? lastNonEmptyLine(this.stderrTail)
    this.status = {
      state: 'error',
      error: detail ? `Notion bridge stopped: ${detail}` : 'Notion bridge stopped'
    }
    this.stop()
  }
}

function lastNonEmptyLine(text: string): string | null {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .findLast(Boolean) ?? null
  )
}

export const notionMcpConnection = new NotionMcpConnection()
