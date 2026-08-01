import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { isSudoUser } from '../services/sudoService'
import { getAllBusinesses } from '../services/portalService'
import { storePortalSession } from '../services/interactionCache'
import { buildPortalMainMenu } from '../embeds/portalEmbed'
import { panelLinkDisplay } from '../utils/panelLink'

export const data = new SlashCommandBuilder()
  .setName('portal')
  .setDescription('Sudo: manage businesses, role mappings, and owners')
  .setDMPermission(false)
  .setDefaultMemberPermissions(0)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  if (!isSudoUser(member)) {
    await interaction.editReply({ content: 'You do not have permission to use this command.' })
    return
  }

  const businesses = await getAllBusinesses(interaction.guild.id)
  const sessionKey = storePortalSession({
    sudoDiscordId: interaction.user.id,
    businessId: null,
    guildId: interaction.guild.id,
  })

  const portalMenu = buildPortalMainMenu(businesses, sessionKey)
  portalMenu.components.push(panelLinkDisplay('/otter/businesses', 'Manage businesses on the website') as any)
  await interaction.editReply({ ...portalMenu, content: null })
}
