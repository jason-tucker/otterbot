/**
 * Run shutdown steps strictly in order, each in its own try/catch so one
 * failing step cannot skip the rest. Kept free of side-effect imports so the
 * ordering is unit-testable (`src/index.ts` itself logs in on import).
 */
export type ShutdownStep = readonly [name: string, run: () => unknown]

export async function runShutdown(steps: readonly ShutdownStep[]): Promise<void> {
  for (const [name, run] of steps) {
    try {
      await run()
    } catch (err) {
      console.warn(`${name} failed`, err)
    }
  }
}
