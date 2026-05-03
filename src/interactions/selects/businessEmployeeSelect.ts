import type { StringSelectMenuInteraction } from 'discord.js'
import { getBusinessRosterSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import { showCharacterEmbed } from '../../commands/lookup'
import type { LookupInteraction } from '../../commands/lookup'
import type { ResolvedBusiness } from '../../types/domain'

export async function handleBusinessEmployeeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return
  await interaction.deferUpdate()

  const sessionKey = interaction.customId.slice('business_employee_select:'.length)
  const session = getBusinessRosterSession(sessionKey)

  if (!session) {
    await interaction.editReply({ content: `This session has expired. Run ${cmd('business', interaction.guildId!)} again.`, embeds: [], components: [] })
    return
  }

  const memberId = interaction.values[0]
  const member = session.roster.members.find((m) => m.id === memberId)

  if (!member) {
    await interaction.editReply({ content: 'Could not find that member in the roster.', embeds: [], components: [] })
    return
  }

  // Resolve staff rank — try cached first, then re-resolve at click time
  let resolved: ResolvedBusiness | null = session.resolved
  if (!resolved) {
    const guildMember = await interaction.guild.members.fetch(interaction.user.id)
    const allResolved = await resolveBusinesses(guildMember)

    if (allResolved.length === 0) {
      await interaction.editReply({ content: 'You need a staff role to look up employees.', embeds: [], components: [] })
      return
    }

    const rosterName = session.roster.businessName.trim().toLowerCase()
    resolved = allResolved.find((r) => {
      const apiName = ((r.business.settings?.apiBusinessName as string | undefined) ?? r.business.name).trim().toLowerCase()
      return apiName === rosterName || r.business.name.trim().toLowerCase() === rosterName
    }) ?? allResolved[0]
  }

  await showCharacterEmbed(interaction as LookupInteraction, resolved, member.character, null)
}
