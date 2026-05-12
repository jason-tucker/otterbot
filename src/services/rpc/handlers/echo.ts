/**
 * Proof-of-life RPC verb. Used by the panel's smoke tests to confirm the
 * command bus is wired end-to-end (panel publish → bot subscribe → HMAC
 * verify → registry dispatch → reply publish → panel subscribe).
 *
 * Registers itself at module load — `rpcServer.ts` does a side-effect
 * import to trigger the registration.
 */

import { registerVerb } from '../registry'

registerVerb('echo', async (params) => {
  return {
    ok: true,
    data: {
      you_said: params,
      server_ts: Date.now(),
    },
  }
})
