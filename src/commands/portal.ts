import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { isSudoUser } from '../services/sudoService'
import { getAllBusinesses } from '../services/portalService'
import { storePortalSession } from '../services/interactionCache'
import { buildPortalMainMenu } from '../embeds/portalEmbed'

export const data = new SlashCommandBuilder()
  .setName('portal')
  .setDescription('Sudo: manage businesses, role mappings, and owners')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  const member = await interaction.guild.members.fetch(interaction.user.id)
  if (!isSudoUser(member)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const businesses = await getAllBusinesses(interaction.guild.id)
  const sessionKey = storePortalSession({
    sudoDiscordId: interaction.user.id,
    businessId: null,
    guildId: interaction.guild.id,
  })

  await interaction.editReply(buildPortalMainMenu(businesses, sessionKey))
}
