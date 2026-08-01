import type { StringSelectMenuInteraction } from 'discord.js'
import { getBusinessRosterSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import { showCharacterEmbed } from '../../commands/lookup'
import type { LookupInteraction } from '../../commands/lookup'
import type { ResolvedBusiness } from '../../types/domain'
import { v2Text } from '../../utils/cv2'

export async function handleBusinessEmployeeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return
  await interaction.deferUpdate()

  const sessionKey = interaction.customId.slice('business_employee_select:'.length)
  const session = getBusinessRosterSession(sessionKey)

  if (!session) {
    await interaction.editReply(v2Text(`This session has expired. Run ${cmd('business', interaction.guildId!)} again.`) as any)
    return
  }

  const memberId = interaction.values[0]
  const member = session.roster.members.find((m) => m.id === memberId)

  if (!member) {
    await interaction.editReply(v2Text('Could not find that member in the roster.') as any)
    return
  }

  // Resolve staff rank — try cached first, then re-resolve at click time
  let resolved: ResolvedBusiness | null = session.resolved
  if (!resolved) {
    const guildMember = await interaction.guild.members.fetch(interaction.user.id)
    const allResolved = await resolveBusinesses(guildMember)

    if (allResolved.length === 0) {
      await interaction.editReply(v2Text('You need a staff role to look up employees.') as any)
      return
    }

    const rosterName = session.roster.businessName.trim().toLowerCase()
    const matched = allResolved.find((r) => {
      const apiName = ((r.business.settings?.apiBusinessName as string | undefined) ?? r.business.name).trim().toLowerCase()
      return apiName === rosterName || r.business.name.trim().toLowerCase() === rosterName
    })
    // If the user isn't actually staff of the searched business, view at
    // least-privilege (employee) rather than inheriting their highest-ranked
    // unrelated business's manager/owner rank, which would surface
    // higher-visibility notes. See REMEDIATION_PLAN F-05.
    resolved = matched ?? (allResolved[0] ? { business: allResolved[0].business, rank: 'employee' } : null)
  }

  if (!resolved) {
    await interaction.editReply(v2Text('You need a staff role to look up employees.') as any)
    return
  }

  await showCharacterEmbed(interaction as LookupInteraction, resolved, member.character, null)
}
