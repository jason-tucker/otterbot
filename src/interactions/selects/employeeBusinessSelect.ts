import { type StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { showEmployeeManageEmbed } from '../../commands/employee'
import { getBusinessById } from '../../services/portalService'
import { v2Text } from '../../utils/cv2'

export async function handleEmployeeBusinessSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.guild) return

  const targetDiscordId = interaction.customId.split(':')[1]
  const selectedBusinessId = interaction.values[0]

  await interaction.deferUpdate()

  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const sudo = isSudoUser(commandMember)
  const resolved = await resolveBusinesses(commandMember)

  let selectedBusiness = resolved.find(
    (r) => r.business.id === selectedBusinessId && (r.rank === 'manager' || r.rank === 'owner'),
  )

  // Sudo users can select any business even if not in their resolved list
  if (!selectedBusiness && sudo) {
    const bizRecord = await getBusinessById(selectedBusinessId)
    if (bizRecord) {
      selectedBusiness = {
        business: {
          id: bizRecord.id,
          name: bizRecord.name,
          slug: bizRecord.slug,
          providerType: bizRecord.providerType,
          guildId: bizRecord.guildId,
          active: bizRecord.active,
          settings: bizRecord.settings,
          createdAt: bizRecord.createdAt,
        },
        rank: 'owner',
      }
    }
  }

  if (!selectedBusiness) {
    await interaction.editReply(v2Text('You no longer have management access to that business.') as any)
    return
  }

  let targetMember
  try {
    targetMember = await interaction.guild.members.fetch(targetDiscordId)
  } catch {
    await interaction.editReply(v2Text('That user is no longer in this server.') as any)
    return
  }

  await showEmployeeManageEmbed(interaction, selectedBusiness, targetMember, sudo)
}
