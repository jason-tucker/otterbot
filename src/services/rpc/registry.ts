/**
 * RPC verb registry for the botpanel command-bus subscriber.
 *
 * Each `cmd.otter.<verb>` channel maps to a single handler registered here.
 * Handlers are registered via side-effect imports from the subscriber
 * (`rpcServer.ts`), so adding a new verb is a one-file change: drop a
 * `services/rpc/handlers/<verb>.ts` that calls `registerVerb(name, fn)` at
 * module load, then import it from `rpcServer.ts`.
 *
 * Shape mirrors the squishybot side so a future shared package can pull
 * both implementations together.
 */

import type { Client } from 'discord.js'

export type VerbContext = {
  client: Client
  requestId: string
  ts: number
}

export type VerbResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; details?: unknown }

export type VerbHandler = (params: unknown, ctx: VerbContext) => Promise<VerbResult>

const registry = new Map<string, VerbHandler>()

/**
 * Register a handler for `cmd.otter.<verb>`. Overwrites any previous
 * registration so module reloads in dev don't accumulate stale handlers.
 */
export function registerVerb(verb: string, handler: VerbHandler): void {
  registry.set(verb, handler)
}

/**
 * Look up a handler by verb name. Returns undefined for unknown verbs —
 * callers should respond with `{ ok: false, error: 'unknown-verb' }`.
 */
export function getVerb(verb: string): VerbHandler | undefined {
  return registry.get(verb)
}
