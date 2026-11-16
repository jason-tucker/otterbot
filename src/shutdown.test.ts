import { describe, it, expect, vi } from 'vitest'
import { runShutdown } from './shutdown'

describe('runShutdown', () => {
  it('runs steps in order, awaiting each, and continues after a failure', async () => {
    const order: string[] = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runShutdown([
      ['a', async () => { await Promise.resolve(); order.push('a') }],
      ['b', () => { throw new Error('boom') }],
      ['c', () => { order.push('c') }],
    ])
    expect(order).toEqual(['a', 'c'])
  })
})
