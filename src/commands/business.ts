import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { MckenzieProvider } from '../services/providers/MckenzieProvider'
import { buildBusinessEmbed } from '../embeds/businessEmbed'
import { audit } from '../services/auditService'
import { storeBusinessRosterSession } from '../services/interactionCache'
import { panelLinkDisplay } from '../utils/panelLink'
import { checkBusinessCooldown, hasRosterDetailAccess } from '../services/rosterAccess'
import { rosterSendAuthorizer } from '../services/rosterDetailAccess'

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

  if (!sudo) {
    const wait = checkBusinessCooldown(interaction.user.id)
    if (wait > 0) {
      await interaction.editReply({ content: `⏳ Slow down — try again in ${wait}s.` })
      return
    }
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

  // Least privilege: contact details, Lookup Employee and Send to Channel only
  // for sudo, staff of the searched business and McKenzie staff.
  const full = hasRosterDetailAccess(allResolved, roster.businessName, sudo)
  const sessionKey = full
    ? storeBusinessRosterSession({ actorDiscordId: interaction.user.id, roster })
    : undefined
  const response = buildBusinessEmbed({ name: roster.businessName, providerType: 'mckenzie' }, roster, {
    sessionKey,
    full,
    authorizeSend: full ? rosterSendAuthorizer(interaction.user.id, roster.businessName) : undefined,
  })
  response.components.push(panelLinkDisplay('/otter/businesses', 'Open businesses on the website') as any)
  await interaction.editReply({ ...response, content: null } as any)
}
