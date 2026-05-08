import { Client, GatewayIntentBits, Partials } from 'discord.js'

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember],
  // Default every reply / send / followUp to "no mentions resolve". Individual
  // call sites that legitimately need to ping (the auto-ticket help-role ping,
  // for example) override this explicitly with `allowedMentions: { roles: [...] }`.
  // This matters because reference commands and modal-driven replies (portal,
  // notes, etc.) interpolate user-supplied text into TextDisplay components,
  // and a stray @everyone / @user in that text would otherwise resolve.
  allowedMentions: { parse: [] },
})
