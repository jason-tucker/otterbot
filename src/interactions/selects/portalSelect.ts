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

export async function handlePortalSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) return

  const member = await interaction.guild.members.fetch(interaction.user.id)
  if (!isSudoUser(member)) {
    await interaction.reply({ content: 'Permission denied.', ephemeral: true })
    return
  }

  const id = interaction.customId
  const colonIdx = id.indexOf(':')
  const action = id.slice(0, colonIdx)
  const sessionKey = id.slice(colonIdx + 1)

  const session = getPortalSession(sessionKey)
  if (!session) {
    await interaction.reply({ content: `This session has expired. Run ${cmd('portal', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  if (action === 'portal_biz_select') {
    await interaction.deferUpdate()
    const selectedId = interaction.values[0]
    updatePortalSession(sessionKey, { businessId: selectedId })

    const [biz, owners, mappings] = await Promise.all([
      getBusinessById(selectedId),
      getBusinessOwners(selectedId),
      getRoleMappings(selectedId, session.guildId),
    ])
    if (!biz) {
      await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
      return
    }
    await interaction.editReply(buildPortalBusinessDetail(biz, owners, mappings, sessionKey))
    return
  }

  const businessId = session.businessId
  if (!businessId) {
    await interaction.reply({ content: 'No business selected.', ephemeral: true })
    return
  }

  if (action === 'portal_rm_role') {
    await interaction.deferUpdate()
    const mappingId = interaction.values[0]

    await removeRoleMapping(mappingId)
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'remove_role_mapping',
      targetType: 'role_mapping',
      targetId: mappingId,
      success: true,
    })

    const [biz, mappings] = await Promise.all([
      getBusinessById(businessId),
      getRoleMappings(businessId, session.guildId),
    ])
    if (!biz) {
      await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
      return
    }
    await interaction.editReply(buildPortalRolesView(biz, mappings, sessionKey))
    return
  }

  if (action === 'portal_rm_owner') {
    await interaction.deferUpdate()
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
      await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
      return
    }
    await interaction.editReply(buildPortalOwnersView(biz, owners, sessionKey))
    return
  }
}
