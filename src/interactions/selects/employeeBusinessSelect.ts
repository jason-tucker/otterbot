import { type StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { showEmployeeManageEmbed } from '../../commands/employee'

export async function handleEmployeeBusinessSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.guild) return

  // customId format: emp_business_select:{targetDiscordId}
  const targetDiscordId = interaction.customId.split(':')[1]
  const selectedBusinessId = interaction.values[0]

  await interaction.deferUpdate()

  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(commandMember)
  const selectedBusiness = resolved.find(
    (r) =>
      r.business.id === selectedBusinessId && (r.rank === 'manager' || r.rank === 'owner'),
  )

  if (!selectedBusiness) {
    await interaction.editReply({
      content: 'You no longer have management access to that business.',
      components: [],
      embeds: [],
    })
    return
  }

  let targetMember
  try {
    targetMember = await interaction.guild.members.fetch(targetDiscordId)
  } catch {
    await interaction.editReply({
      content: 'That user is no longer in this server.',
      components: [],
      embeds: [],
    })
    return
  }

  await showEmployeeManageEmbed(interaction, selectedBusiness, targetMember)
}
