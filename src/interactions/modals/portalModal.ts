import { type ModalSubmitInteraction } from 'discord.js'
import { getPortalSession, updatePortalSession } from '../../services/interactionCache'
import { isSudoUser } from '../../services/sudoService'
import { cmd } from '../../utils/cmdMention'
import {
  getAllBusinesses,
  getBusinessById,
  createBusiness,
  updateBusinessBasic,
  updateBusinessSettings,
  addRoleMapping,
  addBusinessOwner,
  getRoleMappings,
  getBusinessOwners,
} from '../../services/portalService'
import type { StaffRank } from '../../types/domain'
import {
  buildPortalMainMenu,
  buildPortalBusinessDetail,
  buildPortalRolesView,
  buildPortalOwnersView,
  buildPortalPermsView,
} from '../../embeds/portalEmbed'
import { audit } from '../../services/auditService'
import { parseSlug, parseSnowflake } from '../../utils/validators'

const VALID_RANKS: StaffRank[] = ['employee', 'manager', 'owner']

export async function handlePortalModal(interaction: ModalSubmitInteraction): Promise<void> {
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

  // -------------------------------------------------------------------------
  // Create business
  // -------------------------------------------------------------------------

  if (action === 'portal_create_modal') {
    await interaction.deferUpdate()

    const name = interaction.fields.getTextInputValue('name').trim()
    const slugRaw = interaction.fields.getTextInputValue('slug').trim().toLowerCase().replace(/\s+/g, '-')
    const providerTypeRaw = interaction.fields.getTextInputValue('provider_type').trim().toLowerCase()
    const apiName = interaction.fields.getTextInputValue('api_name').trim()

    const slug = parseSlug(slugRaw)
    if (!slug) {
      const businesses = await getAllBusinesses(session.guildId)
      await interaction.editReply(
        buildPortalMainMenu(
          businesses,
          sessionKey,
          '❌ Invalid slug — must be lowercase letters, numbers, and hyphens',
        ),
      )
      return
    }

    if (!['mckenzie', 'discord-only'].includes(providerTypeRaw)) {
      const businesses = await getAllBusinesses(session.guildId)
      await interaction.editReply(
        buildPortalMainMenu(businesses, sessionKey, `❌ Invalid provider type \`${providerTypeRaw}\`. Must be \`mckenzie\` or \`discord-only\`.`),
      )
      return
    }

    let biz
    try {
      biz = await createBusiness({
        name,
        slug,
        providerType: providerTypeRaw as 'mckenzie' | 'discord-only',
        guildId: session.guildId,
        settings: apiName ? { apiBusinessName: apiName } : {},
        createdBy: interaction.user.id,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isDuplicate = msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')
      const businesses = await getAllBusinesses(session.guildId)
      await interaction.editReply(
        buildPortalMainMenu(
          businesses,
          sessionKey,
          isDuplicate
            ? `❌ A business with that name or slug already exists.`
            : `❌ Failed to create business: ${msg}`,
        ),
      )
      return
    }

    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId: biz.id,
      action: 'create_business',
      success: true,
      details: { name: biz.name, slug: biz.slug, providerType: biz.providerType },
    })

    updatePortalSession(sessionKey, { businessId: biz.id })
    const [owners, mappings] = await Promise.all([
      getBusinessOwners(biz.id),
      getRoleMappings(biz.id, session.guildId),
    ])
    await interaction.editReply(buildPortalBusinessDetail(biz, owners, mappings, sessionKey))
    return
  }

  // -------------------------------------------------------------------------
  // All remaining actions require a selected business
  // -------------------------------------------------------------------------

  const businessId = session.businessId
  if (!businessId) {
    await interaction.reply({ content: `No business selected. Run ${cmd('portal', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  // -------------------------------------------------------------------------
  // Edit basic info
  // -------------------------------------------------------------------------

  if (action === 'portal_edit_modal') {
    await interaction.deferUpdate()

    const name = interaction.fields.getTextInputValue('name').trim()
    const slug = interaction.fields.getTextInputValue('slug').trim().toLowerCase().replace(/\s+/g, '-')
    const providerTypeRaw = interaction.fields.getTextInputValue('provider_type').trim().toLowerCase()

    if (!['mckenzie', 'discord-only'].includes(providerTypeRaw)) {
      const [biz, owners, mappings] = await Promise.all([
        getBusinessById(businessId),
        getBusinessOwners(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
        return
      }
      await interaction.editReply({
        ...buildPortalBusinessDetail(biz, owners, mappings, sessionKey),
        content: `❌ Invalid provider type \`${providerTypeRaw}\`. Must be \`mckenzie\` or \`discord-only\`.`,
      })
      return
    }

    await updateBusinessBasic(businessId, {
      name,
      slug,
      providerType: providerTypeRaw as 'mckenzie' | 'discord-only',
      updatedBy: interaction.user.id,
    })

    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'update_business',
      success: true,
      details: { name, slug, providerType: providerTypeRaw },
    })

    const [biz, owners, mappings] = await Promise.all([
      getBusinessById(businessId),
      getBusinessOwners(businessId),
      getRoleMappings(businessId, session.guildId),
    ])
    if (!biz) {
      await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
      return
    }
    await interaction.editReply(buildPortalBusinessDetail(biz, owners, mappings, sessionKey))
    return
  }

  // -------------------------------------------------------------------------
  // Add role mapping
  // -------------------------------------------------------------------------

  if (action === 'portal_add_role_modal') {
    await interaction.deferUpdate()

    const roleIdRaw = interaction.fields.getTextInputValue('role_id').trim()
    const rankRaw = interaction.fields.getTextInputValue('rank').trim().toLowerCase()
    const label = interaction.fields.getTextInputValue('label').trim()
    const isBaseRaw = interaction.fields.getTextInputValue('is_base').trim().toLowerCase()
    const minRankRaw = interaction.fields.getTextInputValue('min_rank').trim().toLowerCase()

    const roleId = parseSnowflake(roleIdRaw)
    if (!roleId) {
      const [biz, mappings] = await Promise.all([
        getBusinessById(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
        return
      }
      await interaction.editReply({
        ...buildPortalRolesView(biz, mappings, sessionKey),
        content: '❌ Invalid role ID — must be a Discord snowflake (17-20 digits)',
      })
      return
    }

    if (!VALID_RANKS.includes(rankRaw as StaffRank)) {
      const [biz, mappings] = await Promise.all([
        getBusinessById(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
        return
      }
      await interaction.editReply({
        ...buildPortalRolesView(biz, mappings, sessionKey),
        content: `❌ Invalid rank \`${rankRaw}\`. Must be \`employee\`, \`manager\`, or \`owner\`.`,
      })
      return
    }

    const minRank: StaffRank = VALID_RANKS.includes(minRankRaw as StaffRank)
      ? (minRankRaw as StaffRank)
      : 'manager'

    // Try to resolve role name from guild cache or API
    let roleName = roleId
    try {
      const role = interaction.guild!.roles.cache.get(roleId)
        ?? await interaction.guild!.roles.fetch(roleId)
      if (role) roleName = role.name
    } catch {
      // keep roleId as fallback
    }

    try {
      await addRoleMapping({
        businessId,
        guildId: session.guildId,
        roleId,
        roleName,
        rank: rankRaw as StaffRank,
        label: label || roleName,
        isBase: isBaseRaw === 'yes',
        autoGrantEmployee: false,
        minRankToAssign: minRank,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isDuplicate = msg.includes('unique') || msg.includes('duplicate')
      const [biz, mappings] = await Promise.all([
        getBusinessById(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
        return
      }
      await interaction.editReply({
        ...buildPortalRolesView(biz, mappings, sessionKey),
        content: isDuplicate
          ? `❌ That role is already mapped to a business in this server.`
          : `❌ Failed to add role: ${msg}`,
      })
      return
    }

    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'add_role_mapping',
      targetType: 'role',
      targetId: roleId,
      success: true,
      details: { rank: rankRaw, label: label || roleName, isBase: isBaseRaw === 'yes' },
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

  // -------------------------------------------------------------------------
  // Add owner
  // -------------------------------------------------------------------------

  if (action === 'portal_add_owner_modal') {
    await interaction.deferUpdate()

    const discordUserIdRaw = interaction.fields.getTextInputValue('discord_user_id').trim()

    const discordUserId = parseSnowflake(discordUserIdRaw)
    if (!discordUserId) {
      const [biz, owners] = await Promise.all([
        getBusinessById(businessId),
        getBusinessOwners(businessId),
      ])
      if (!biz) {
        await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
        return
      }
      await interaction.editReply({
        ...buildPortalOwnersView(biz, owners, sessionKey),
        content: '❌ Invalid user ID — must be a Discord snowflake (17-20 digits)',
      })
      return
    }

    try {
      await interaction.guild!.members.fetch(discordUserId)
    } catch {
      const [biz, owners] = await Promise.all([
        getBusinessById(businessId),
        getBusinessOwners(businessId),
      ])
      if (!biz) {
        await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
        return
      }
      await interaction.editReply({
        ...buildPortalOwnersView(biz, owners, sessionKey),
        content: `❌ User \`${discordUserId}\` is not in this server.`,
      })
      return
    }

    await addBusinessOwner(businessId, discordUserId, interaction.user.id)

    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'add_business_owner',
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

  // -------------------------------------------------------------------------
  // Set API business name
  // -------------------------------------------------------------------------

  if (action === 'portal_set_api_modal') {
    await interaction.deferUpdate()

    const apiName = interaction.fields.getTextInputValue('api_name').trim()
    await updateBusinessSettings(businessId, { apiBusinessName: apiName }, interaction.user.id)

    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'set_api_name',
      success: true,
      details: { apiBusinessName: apiName || '(cleared)' },
    })

    const biz = await getBusinessById(businessId)
    if (!biz) {
      await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
      return
    }
    await interaction.editReply(buildPortalPermsView(biz, sessionKey))
    return
  }
}
