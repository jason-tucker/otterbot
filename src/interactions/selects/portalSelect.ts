import { type StringSelectMenuInteraction } from 'discord.js'
import { getPortalSession, updatePortalSession } from '../../services/interactionCache'
import { isSudoUser } from '../../services/sudoService'
import { cmd } from '../../utils/cmdMention'
import {
  getBusinessById,
  getRoleMappings,
  getBusinessOwners,
  removeRoleMapping,
  removeBusinessOwner,
} from '../../services/portalService'
import {
  buildPortalBusinessDetail,
  buildPortalRolesView,
  buildPortalOwnersView,
} from '../../embeds/portalEmbed'
import { audit } from '../../services/auditService'
import { v2Text } from '../../utils/cv2'

export async function handlePortalSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) return

  // Ack immediately — every branch below ends in deferUpdate() anyway, so
  // acking before the member fetch keeps a slow fetch from tripping a 10062.
  await interaction.deferUpdate()

  const member = await interaction.guild.members.fetch(interaction.user.id)
  if (!isSudoUser(member)) {
    await interaction.editReply(v2Text('Permission denied.') as any)
    return
  }

  const id = interaction.customId
  const colonIdx = id.indexOf(':')
  const action = id.slice(0, colonIdx)
  const sessionKey = id.slice(colonIdx + 1)

  const session = getPortalSession(sessionKey)
  if (!session) {
    await interaction.editReply(v2Text(`This session has expired. Run ${cmd('portal', interaction.guildId!)} again.`) as any)
    return
  }

  if (action === 'portal_biz_select') {
    const selectedId = interaction.values[0]
    updatePortalSession(sessionKey, { businessId: selectedId })

    const [biz, owners, mappings] = await Promise.all([
      getBusinessById(selectedId),
      getBusinessOwners(selectedId),
      getRoleMappings(selectedId, session.guildId),
    ])
    if (!biz) {
      await interaction.editReply(v2Text('Business not found.') as any)
      return
    }
    await interaction.editReply(buildPortalBusinessDetail(biz, owners, mappings, sessionKey))
    return
  }

  const businessId = session.businessId
  if (!businessId) {
    await interaction.editReply(v2Text('No business selected.') as any)
    return
  }

  if (action === 'portal_rm_role') {
    const mappingId = interaction.values[0]

    // Scope the delete to the session's selected business so a stale select
    // value can't remove another business's role mapping.
    const removed = await removeRoleMapping(mappingId, businessId)
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'remove_role_mapping',
      targetType: 'role_mapping',
      targetId: mappingId,
      success: removed,
    })
    if (!removed) {
      await interaction.editReply(v2Text('That role mapping no longer exists or does not belong to this business.') as any)
      return
    }

    const [biz, mappings] = await Promise.all([
      getBusinessById(businessId),
      getRoleMappings(businessId, session.guildId),
    ])
    if (!biz) {
      await interaction.editReply(v2Text('Business not found.') as any)
      return
    }
    await interaction.editReply(buildPortalRolesView(biz, mappings, sessionKey))
    return
  }

  if (action === 'portal_rm_owner') {
    const discordUserId = interaction.values[0]

    await removeBusinessOwner(businessId, discordUserId)
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'remove_business_owner',
      targetType: 'discord_user',
      targetId: discordUserId,
      success: true,
    })

    const [biz, owners] = await Promise.all([
      getBusinessById(businessId),
      getBusinessOwners(businessId),
    ])
    if (!biz) {
      await interaction.editReply(v2Text('Business not found.') as any)
      return
    }
    await interaction.editReply(buildPortalOwnersView(biz, owners, sessionKey))
    return
  }
}
