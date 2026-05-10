import { describe, it, expect, vi } from 'vitest'

// Stub modules that pull in the env-validating db client / dotenv at import time.
// hasMinRank is pure — it only reads RANK_ORDER from types/domain — but the
// service file lives alongside DB-coupled code.
vi.mock('../db/client', () => ({ db: {} }))
vi.mock('../config/env', () => ({ env: { sudoRoleIds: [] } }))

import { hasMinRank } from './permissionService'
import type { StaffRank } from '../types/domain'

describe('hasMinRank — full 3x3 matrix', () => {
  const ranks: StaffRank[] = ['employee', 'manager', 'owner']

  // Owner >= manager >= employee. Build the full matrix explicitly so any
  // accidental flip in RANK_ORDER fails loudly.
  const expected: Record<StaffRank, Record<StaffRank, boolean>> = {
    employee: { employee: true, manager: false, owner: false },
    manager: { employee: true, manager: true, owner: false },
    owner: { employee: true, manager: true, owner: true },
  }

  for (const rank of ranks) {
    for (const min of ranks) {
      it(`${rank} ${expected[rank][min] ? 'satisfies' : 'does not satisfy'} min=${min}`, () => {
        expect(hasMinRank(rank, min)).toBe(expected[rank][min])
      })
    }
  }
})
