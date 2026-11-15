import type { StringSelectMenuInteraction } from 'discord.js'
import { getBusinessRosterSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { getAllBusinesses } from '../../services/portalService'
import type { ResolvedBusiness } from '../../types/domain'
import { pickRosterViewer } from '../../services/rosterAccess'
import { auditSafe } from '../../services/auditService'
import { showCharacterEmbed } from '../../commands/lookup'
import type { LookupInteraction } from '../../commands/lookup'
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

  // Only the staff member who ran the search may use its roster.
  if (session.actorDiscordId !== interaction.user.id) {
    await interaction.followUp({ content: 'This roster belongs to another user. Run the search yourself.', ephemeral: true })
    return
  }

  const memberId = interaction.values[0]
  const member = session.roster.members.find((m) => m.id === memberId)

  if (!member) {
    await interaction.editReply(v2Text('Could not find that member in the roster.') as any)
    return
  }

  // Re-validate on every click — never trust a cached rank. Only staff of the
  // searched business, McKenzie staff and sudo may see roster PII.
  const guildMember = await interaction.guild.members.fetch(interaction.user.id)
  const sudo = isSudoUser(guildMember)
  const allResolved = await resolveBusinesses(guildMember)
  // A sudo user who is also staff of this business or McKenzie keeps that rank;
  // with no match, sudo views under McKenzie at employee rank (least privilege).
  let resolved: ResolvedBusiness | null = pickRosterViewer(allResolved, session.roster.businessName)
  if (!resolved && sudo) {
    const mke = (await getAllBusinesses(interaction.guild.id)).find((b) => b.providerType === 'mckenzie' && b.active)
    if (mke) {
      resolved = {
        business: {
          id: mke.id,
          name: mke.name,
          slug: mke.slug,
          providerType: mke.providerType,
          guildId: mke.guildId,
          active: mke.active,
          settings: mke.settings,
          createdAt: mke.createdAt,
        },
        rank: 'employee',
      }
    }
  }

  if (!resolved) {
    await interaction.editReply(v2Text('You do not have access to look up employees of this business.') as any)
    return
  }

  await auditSafe({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    businessId: resolved.business.id,
    action: 'lookup',
    targetType: 'character',
    targetId: member.character.id,
    details: { source: 'business_roster', roster: session.roster.businessName },
  })

  await showCharacterEmbed(interaction as LookupInteraction, resolved, member.character, null)
}
