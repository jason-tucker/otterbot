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
import {
  parseSlug,
  parseSnowflake,
  parseBusinessName,
  checkMappableRole,
  type MappableRoleInfo,
  isUniqueViolation,
  PROTECTED_BUSINESS_SLUGS,
} from '../../utils/validators'
import { v2Text } from '../../utils/cv2'

const VALID_RANKS: StaffRank[] = ['employee', 'manager', 'owner']

export async function handlePortalModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild) return

  // Every branch below ends in deferUpdate() — ack immediately so the member
  // fetch can't leave the interaction un-acked long enough to trip a 10062.
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

  // -------------------------------------------------------------------------
  // Create business
  // -------------------------------------------------------------------------

  if (action === 'portal_create_modal') {
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
      console.error('[portal] createBusiness failed:', msg, (err as { cause?: unknown })?.cause ?? '')
      const isDuplicate = isUniqueViolation(err)
      const businesses = await getAllBusinesses(session.guildId)
      await interaction.editReply(
        buildPortalMainMenu(
          businesses,
          sessionKey,
          isDuplicate
            ? `❌ A business with that name or slug already exists.`
            : '❌ Failed to create business.',
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
    await interaction.editReply(v2Text(`No business selected. Run ${cmd('portal', interaction.guildId!)} again.`) as any)
    return
  }

  // -------------------------------------------------------------------------
  // Edit basic info
  // -------------------------------------------------------------------------

  if (action === 'portal_edit_modal') {
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
        await interaction.editReply(v2Text('Business not found.') as any)
        return
      }
      await interaction.editReply(buildPortalBusinessDetail(biz, owners, mappings, sessionKey))
      await interaction.followUp({ content: `❌ Invalid provider type \`${providerTypeRaw}\`. Must be \`mckenzie\` or \`discord-only\`.`, ephemeral: true })
      return
    }

    const showDetail = async (): Promise<boolean> => {
      const [biz, owners, mappings] = await Promise.all([
        getBusinessById(businessId),
        getBusinessOwners(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply(v2Text('Business not found.') as any)
        return false
      }
      await interaction.editReply(buildPortalBusinessDetail(biz, owners, mappings, sessionKey))
      return true
    }
    const reject = async (message: string): Promise<void> => {
      if (await showDetail()) {
        await interaction.followUp({ content: `❌ ${message}`, ephemeral: true })
      }
    }

    const parsedName = parseBusinessName(name)
    if (!parsedName) {
      await reject('Invalid name — must be 1-100 characters.')
      return
    }
    const parsedSlug = parseSlug(slug)
    if (!parsedSlug) {
      await reject('Invalid slug — must start with a letter and use only lowercase letters, numbers and hyphens (max 50).')
      return
    }
    const current = await getBusinessById(businessId)
    if (current && current.slug !== parsedSlug && PROTECTED_BUSINESS_SLUGS.includes(current.slug)) {
      await reject(`The slug \`${current.slug}\` is referenced by bot code and cannot be changed.`)
      return
    }

    try {
      await updateBusinessBasic(businessId, {
        name: parsedName,
        slug: parsedSlug,
        providerType: providerTypeRaw as 'mckenzie' | 'discord-only',
        updatedBy: interaction.user.id,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[portal] updateBusinessBasic failed:', msg, (err as { cause?: unknown })?.cause ?? '')
      await reject(isUniqueViolation(err) ? 'A business with that name or slug already exists.' : 'Failed to update the business.')
      return
    }

    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'update_business',
      success: true,
      details: { name: parsedName, slug: parsedSlug, providerType: providerTypeRaw },
    })

    await showDetail()
    return
  }

  // -------------------------------------------------------------------------
  // Add role mapping
  // -------------------------------------------------------------------------

  if (action === 'portal_add_role_modal') {
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
        await interaction.editReply(v2Text('Business not found.') as any)
        return
      }
      await interaction.editReply(buildPortalRolesView(biz, mappings, sessionKey))
      await interaction.followUp({ content: '❌ Invalid role ID — must be a Discord snowflake (17-20 digits)', ephemeral: true })
      return
    }

    if (!VALID_RANKS.includes(rankRaw as StaffRank)) {
      const [biz, mappings] = await Promise.all([
        getBusinessById(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply(v2Text('Business not found.') as any)
        return
      }
      await interaction.editReply(buildPortalRolesView(biz, mappings, sessionKey))
      await interaction.followUp({ content: `❌ Invalid rank \`${rankRaw}\`. Must be \`employee\`, \`manager\`, or \`owner\`.`, ephemeral: true })
      return
    }

    const minRank: StaffRank = VALID_RANKS.includes(minRankRaw as StaffRank)
      ? (minRankRaw as StaffRank)
      : 'manager'

    // Try to resolve role name from guild cache or API
    let roleName = roleId
    let fetchedRole: MappableRoleInfo | null = null
    try {
      const role = interaction.guild!.roles.cache.get(roleId)
        ?? await interaction.guild!.roles.fetch(roleId)
      if (role) {
        roleName = role.name
        fetchedRole = { managed: role.managed, position: role.position, permissions: role.permissions }
      }
    } catch {
      // keep roleId as fallback
    }

    // Refuse @everyone, managed, dangerous and too-high roles. If the bot's own
    // top role cannot be read, botTop stays null and checkMappableRole refuses.
    let botTop: number | null = null
    try {
      botTop = (interaction.guild!.members.me ?? await interaction.guild!.members.fetchMe()).roles.highest.position
    } catch {
      botTop = null
    }
    const roleProblem = checkMappableRole(roleId, interaction.guild!.id, fetchedRole, botTop)
    if (roleProblem) {
      const [biz, mappings] = await Promise.all([
        getBusinessById(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply(v2Text('Business not found.') as any)
        return
      }
      await interaction.editReply(buildPortalRolesView(biz, mappings, sessionKey))
      await interaction.followUp({ content: `❌ ${roleProblem}`, ephemeral: true })
      return
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
      console.error('[portal] addRoleMapping failed:', msg, (err as { cause?: unknown })?.cause ?? '')
      const isDuplicate = isUniqueViolation(err)
      const [biz, mappings] = await Promise.all([
        getBusinessById(businessId),
        getRoleMappings(businessId, session.guildId),
      ])
      if (!biz) {
        await interaction.editReply(v2Text('Business not found.') as any)
        return
      }
      await interaction.editReply(buildPortalRolesView(biz, mappings, sessionKey))
      await interaction.followUp({
        content: isDuplicate
          ? `❌ That role is already mapped to a business in this server.`
          : '❌ Failed to add role.',
        ephemeral: true,
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
      await interaction.editReply(v2Text('Business not found.') as any)
      return
    }
    await interaction.editReply(buildPortalRolesView(biz, mappings, sessionKey))
    return
  }

  // -------------------------------------------------------------------------
  // Add owner
  // -------------------------------------------------------------------------

  if (action === 'portal_add_owner_modal') {
    const discordUserIdRaw = interaction.fields.getTextInputValue('discord_user_id').trim()

    const discordUserId = parseSnowflake(discordUserIdRaw)
    if (!discordUserId) {
      const [biz, owners] = await Promise.all([
        getBusinessById(businessId),
        getBusinessOwners(businessId),
      ])
      if (!biz) {
        await interaction.editReply(v2Text('Business not found.') as any)
        return
      }
      await interaction.editReply(buildPortalOwnersView(biz, owners, sessionKey))
      await interaction.followUp({ content: '❌ Invalid user ID — must be a Discord snowflake (17-20 digits)', ephemeral: true })
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
        await interaction.editReply(v2Text('Business not found.') as any)
        return
      }
      await interaction.editReply(buildPortalOwnersView(biz, owners, sessionKey))
      await interaction.followUp({ content: `❌ User \`${discordUserId}\` is not in this server.`, ephemeral: true })
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
      await interaction.editReply(v2Text('Business not found.') as any)
      return
    }
    await interaction.editReply(buildPortalOwnersView(biz, owners, sessionKey))
    return
  }

  // -------------------------------------------------------------------------
  // Set API business name
  // -------------------------------------------------------------------------

  if (action === 'portal_set_api_modal') {
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
      await interaction.editReply(v2Text('Business not found.') as any)
      return
    }
    await interaction.editReply(buildPortalPermsView(biz, sessionKey))
    return
  }
}
