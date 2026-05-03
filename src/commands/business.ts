import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { getProvider } from '../services/businessService'
import { MckenzieProvider } from '../services/providers/MckenzieProvider'
import { buildBusinessEmbed } from '../embeds/businessEmbed'
import { audit } from '../services/auditService'
import type { ResolvedBusiness } from '../types/domain'

export const data = new SlashCommandBuilder()
  .setName('business')
  .setDescription('Look up a business roster by name, or view your own business info')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Business name to search (e.g. Euphoric, McKenzie Enterprises)')
      .setRequired(false)
  )
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  const searchName = interaction.options.getString('name')

  if (searchName) {
    await interaction.deferReply({ ephemeral: true })
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

    const response = buildBusinessEmbed({ name: roster.businessName, providerType: 'mckenzie' }, roster)
    await interaction.editReply(response)
    return
  }

  // No name provided — show the user's own business (staff only)
  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)

  if (resolved.length === 0) {
    await interaction.editReply('You are not registered as staff for any business. Use `/business name:<name>` to search by name.')
    return
  }

  if (resolved.length === 1) {
    await showBusiness(interaction, resolved[0])
    return
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('business_info_select')
    .setPlaceholder('Which business?')
    .addOptions(
      resolved.map((r) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(r.business.name)
          .setDescription(`Acting as ${r.rank}`)
          .setValue(r.business.id)
      )
    )

  await interaction.editReply({
    content: 'Which business would you like to view?',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  })
}

export async function showBusiness(
  interaction: ChatInputCommandInteraction,
  resolved: ResolvedBusiness
): Promise<void> {
  const { business } = resolved
  const provider = getProvider(business)

  let roster = null
  try {
    roster = await provider.getBusinessRoster()
  } catch (err) {
    console.error('Roster fetch error:', err)
  }

  await audit({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    businessId: business.id,
    action: 'business_view',
    success: roster !== null,
  })

  const response = buildBusinessEmbed(business, roster)
  await interaction.editReply(response)
}
