import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  UserContextMenuCommandInteraction,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { runLookup } from './lookup'

// Right-click a user → Apps → "Lookup"
// Restricted to McKenzie Enterprises staff only.
export const data = new ContextMenuCommandBuilder()
  .setName('Lookup')
  .setType(ApplicationCommandType.User)
  .setDMPermission(false)

export async function execute(interaction: UserContextMenuCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)

  // Only MKE staff can use the right-click lookup
  const mke = resolved.find((r) => r.business.slug === 'mckenzie')

  if (!mke) {
    await interaction.editReply('This command is only available to McKenzie Enterprises staff.')
    return
  }

  const target = interaction.targetUser
  await runLookup(interaction, mke, target.id, target.username)
}
