import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { MckenzieProvider } from '../services/providers/MckenzieProvider'
import { buildBusinessEmbed } from '../embeds/businessEmbed'
import { audit } from '../services/auditService'
import { storeBusinessRosterSession } from '../services/interactionCache'

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
  await interaction.editReply({ ...response, content: null } as any)
}
