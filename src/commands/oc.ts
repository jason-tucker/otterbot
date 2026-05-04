import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../services/permissionService'
import { getAllStock } from '../services/ocStockService'
import { buildOCPublicEmbed } from '../embeds/ocEmbed'

export const data = new SlashCommandBuilder()
  .setName('oc')
  .setDescription('View Original Clothing current stock and availability')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply()

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')
  const isManager = oc ? hasMinRank(oc.rank, 'manager') : false

  const items = await getAllStock()
  await interaction.editReply({ ...buildOCPublicEmbed(items, isManager), content: null })
}
