import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  type UserContextMenuCommandInteraction,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { getAllBusinesses } from '../services/portalService'
import { runEmployeeManage } from './employee'
import type { ResolvedBusiness } from '../types/domain'

// Right-click a user → Apps → "Manage Employee"
export const data = new ContextMenuCommandBuilder()
  .setName('Manage Employee')
  .setType(ApplicationCommandType.User)
  .setDMPermission(false)
  .setDefaultMemberPermissions(0)

export async function execute(interaction: UserContextMenuCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const sudo = isSudoUser(commandMember)
  const resolved = await resolveBusinesses(commandMember)

  let manageable: ResolvedBusiness[]
  if (sudo) {
    const allBizRecords = await getAllBusinesses(interaction.guild.id)
    manageable = allBizRecords.map((b) => ({
      business: b,
      rank: 'owner' as const,
    }))
  } else {
    manageable = resolved.filter((r) => r.rank === 'manager' || r.rank === 'owner')
  }

  if (manageable.length === 0) {
    await interaction.editReply('You do not have management permissions for any business.')
    return
  }

  await runEmployeeManage(interaction, interaction.targetUser.id)
}
