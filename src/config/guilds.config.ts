// Hardcoded guild IDs — no env var needed.
// Commands are deployed to both. Role mappings are seeded for both.

export const GUILDS = {
  production: '883149218942947350',
  dev: '552646508529319978',
} as const

export const ALL_GUILD_IDS = Object.values(GUILDS)
