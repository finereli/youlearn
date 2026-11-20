// pwa-kit: mcp/functions/mcp-server.ts v1
// The MCP endpoint itself: Streamable HTTP with JSON replies (no SSE, no sessions), behind mcp-auth's bearer check.
// Describe the app's tools; this does the JSON-RPC.
//
//   // functions/mcp.ts (Pages) or the /mcp branch of the Worker
//   const mcp = makeMcpEndpoint({
//     auth: mcpAuth, name: 'accountant', instructions: 'Read-only view of the household books. Start with overview.',
//     tools: [overview, forecast],
//     context: (sub, request) => ({ db: env.DB, sub }),
//   })
//   export const onRequest = ({ request, env }) => mcp(request, env.DB)
//
// Tool design, from three apps:
// - Reuse the app's own queries and maths so an agent sees what the screens show. Add a tool when an agent needs a new view.
// - Start read-only. A write tool refuses bad input with isError and says what to fix: the agent reads it and retries.
// - Give agents a `guide` tool and put the rules where it will read them: instructions + guide, not a docs page.
// - Every tool resolves its data through the account (`ctx`), never through ids alone: an id from another account is "not found".

import type { McpAuth } from './mcp-auth'
import { json, preflight } from './mcp-auth'

export interface McpToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export interface McpTool<Ctx> {
  name: string
  description: string
  /** JSON Schema for the arguments. */
  inputSchema: Record<string, unknown>
  /** Return a string or any JSON; throw for an unexpected failure (it becomes an error result, not a crash). */
  run(args: Record<string, unknown>, ctx: Ctx): Promise<unknown>
}

/** A tool result: strings as is, anything else as indented JSON. */
export const text = (t: unknown, isError = false): McpToolResult => ({
  content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }],
  ...(isError && { isError: true }),
})
/** A refusal the agent should read and act on. */
export const fail = (t: unknown) => text(t, true)

const isResult = (x: unknown): x is McpToolResult => !!x && typeof x === 'object' && Array.isArray((x as McpToolResult).content)

interface Rpc { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

export function makeMcpEndpoint<Ctx>(opts: {
  auth: McpAuth
  name: string
  version?: string
  instructions: string
  tools: McpTool<Ctx>[]
  context(sub: string, request: Request): Ctx
}) {
  async function rpc(msg: Rpc, ctx: Ctx) {
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result })
    const error = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
    switch (msg.method) {
      case 'initialize': {
        const asked = (msg.params?.protocolVersion as string) ?? ''
        return reply({
          protocolVersion: ['2025-06-18', '2025-03-26', '2024-11-05'].includes(asked) ? asked : '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: opts.name, version: opts.version ?? '1.0.0' },
          instructions: opts.instructions,
        })
      }
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({ tools: opts.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
      case 'tools/call': {
        const tool = opts.tools.find((t) => t.name === msg.params?.name)
        if (!tool) return error(-32602, `unknown tool ${String(msg.params?.name)}`)
        try {
          const out = await tool.run((msg.params?.arguments as Record<string, unknown>) ?? {}, ctx)
          return reply(isResult(out) ? out : text(out))
        } catch (e) {
          return reply(fail(`${tool.name} failed: ${String((e as Error).message ?? e).slice(0, 200)}`))
        }
      }
      default:
        // notifications (no id) get no reply
        return msg.id === undefined ? null : error(-32601, `method not found: ${String(msg.method)}`)
    }
  }

  return async function handle(request: Request, db: D1Database): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight()
    if (request.method !== 'POST') return json({ error: 'POST JSON-RPC here' }, 405, { Allow: 'POST' })
    const sub = await opts.auth.bearerSub(request, db)
    if (!sub) return opts.auth.unauthorized(new URL(request.url).origin)
    const body = (await request.json().catch(() => null)) as Rpc | Rpc[] | null
    if (!body) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400)
    const ctx = opts.context(sub, request)
    const replies = (await Promise.all((Array.isArray(body) ? body : [body]).map((m) => rpc(m, ctx)))).filter(Boolean)
    if (!replies.length) return new Response(null, { status: 202, headers: { 'Access-Control-Allow-Origin': '*' } })
    return json(Array.isArray(body) ? replies : replies[0])
  }
}
