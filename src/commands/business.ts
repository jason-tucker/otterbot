import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { MckenzieProvider } from '../services/providers/MckenzieProvider'
import { buildBusinessEmbed } from '../embeds/businessEmbed'
import { audit } from '../services/auditService'
import { storeBusinessRosterSession } from '../services/interactionCache'
import { panelLinkDisplay } from '../utils/panelLink'

export const data = new SlashCommandBuilder()
  .setName('business')
  .setDescription('Look up a business roster')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Business name to search (e.g. Euphoric, McKenzie Enterprises)')
      .setRequired(true)
  )
  .setDMPermission(false)

/**
 * Per-user rate limit for `/business`. It's the only command that hits the
 * MKE roster API with an arbitrary search string and had no throttle; 30s
 * mirrors `/lookup`. Sudo bypasses.
 */
const BUSINESS_COOLDOWN_MS = 30_000
const lastBusinessSearchAt = new Map<string, number>()
function sweepBusinessCooldowns(): void {
  const cutoff = Date.now() - BUSINESS_COOLDOWN_MS
  for (const [k, t] of lastBusinessSearchAt) if (t < cutoff) lastBusinessSearchAt.delete(k)
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  const searchName = interaction.options.getString('name', true)
  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const allResolved = await resolveBusinesses(member)
  const sudo = isSudoUser(member)

  if (allResolved.length === 0 && !sudo) {
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      action: 'business_search',
      success: false,
      details: { query: searchName, reason: 'not_staff' },
    })
    await interaction.editReply({
      content: 'You need to be a staff member of at least one business to use this command.',
    })
    return
  }

  if (!sudo) {
    const last = lastBusinessSearchAt.get(interaction.user.id) ?? 0
    const remaining = BUSINESS_COOLDOWN_MS - (Date.now() - last)
    if (remaining > 0) {
      await interaction.editReply({ content: `⏳ Slow down — try again in ${Math.ceil(remaining / 1000)}s.` })
      return
    }
    if (lastBusinessSearchAt.size > 500) sweepBusinessCooldowns()
    lastBusinessSearchAt.set(interaction.user.id, Date.now())
  }

  const roster = await MckenzieProvider.findByName(searchName)

  await audit({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    action: 'business_search',
    success: roster !== null,
    details: { query: searchName },
  })

  if (!roster) {
    await interaction.editReply({ content: `No business found with the name **${searchName}**.` })
    return
  }

  // Pick the resolved-business that matches the searched roster (so the Lookup Employee
  // session attaches the right rank); fall back to the first resolved or null.
  const rosterName = roster.businessName.trim().toLowerCase()
  const resolved = allResolved.find((r) => {
    const apiName = ((r.business.settings?.apiBusinessName as string | undefined) ?? r.business.name).trim().toLowerCase()
    return apiName === rosterName || r.business.name.trim().toLowerCase() === rosterName
  }) ?? allResolved[0] ?? null

  const sessionKey = storeBusinessRosterSession({ resolved, roster })
  const response = buildBusinessEmbed({ name: roster.businessName, providerType: 'mckenzie' }, roster, sessionKey)
  response.components.push(panelLinkDisplay('/otter/businesses', 'Open businesses on the website') as any)
  await interaction.editReply({ ...response, content: null } as any)
}
