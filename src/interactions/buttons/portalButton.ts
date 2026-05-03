import {
  type ButtonInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { getPortalSession, updatePortalSession } from '../../services/interactionCache'
import { isSudoUser } from '../../services/sudoService'
import { cmd } from '../../utils/cmdMention'
import type { BusinessSettings } from '../../services/portalService'
import {
  getAllBusinesses,
  getBusinessById,
  getRoleMappings,
  getBusinessOwners,
  deactivateBusiness,
  reactivateBusiness,
  toggleBusinessSetting,
} from '../../services/portalService'
import {
  buildPortalMainMenu,
  buildPortalBusinessDetail,
  buildPortalRolesView,
  buildPortalOwnersView,
  buildPortalPermsView,
} from '../../embeds/portalEmbed'
import { audit } from '../../services/auditService'

export async function handlePortalButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return

  const member = await interaction.guild.members.fetch(interaction.user.id)
  if (!isSudoUser(member)) {
    await interaction.reply({ content: 'Permission denied.', ephemeral: true })
    return
  }

  const id = interaction.customId

  // portal_toggle:{flag}:{sk} has three colon-separated segments
  let action: string
  let sessionKey: string

  if (id.startsWith('portal_toggle:')) {
    const parts = id.split(':')
    action = 'toggle'
    sessionKey = parts[2]
  } else {
    const colonIdx = id.indexOf(':')
    action = id.slice('portal_'.length, colonIdx)
    sessionKey = id.slice(colonIdx + 1)
  }

  const session = getPortalSession(sessionKey)
  if (!session) {
    await interaction.reply({ content: `This session has expired. Run ${cmd('portal', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  // -------------------------------------------------------------------------
  // Actions that work without a selected business
  // -------------------------------------------------------------------------

  if (action === 'main') {
    await interaction.deferUpdate()
    updatePortalSession(sessionKey, { businessId: null })
    const businesses = await getAllBusinesses(session.guildId)
    await interaction.editReply(buildPortalMainMenu(businesses, sessionKey))
    return
  }

  if (action === 'create') {
    const modal = new ModalBuilder()
      .setCustomId(`portal_create_modal:${sessionKey}`)
      .setTitle('Create Business')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Business Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('slug')
            .setLabel('Slug (lowercase, no spaces)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setPlaceholder('e.g. mckenzie'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('provider_type')
            .setLabel('Provider Type')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('mckenzie  or  discord-only'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('api_name')
            .setLabel('API Business Name (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('For McKenzie API integration'),
        ),
      )
    await interaction.showModal(modal)
    return
  }

  // -------------------------------------------------------------------------
  // Actions that require a selected business
  // -------------------------------------------------------------------------

  const businessId = session.businessId
  if (!businessId) {
    await interaction.reply({ content: 'No business selected. Use the main menu to select one.', ephemeral: true })
    return
  }

  if (action === 'view') {
    await interaction.deferUpdate()
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

  if (action === 'edit') {
    const biz = await getBusinessById(businessId)
    if (!biz) {
      await interaction.reply({ content: 'Business not found.', ephemeral: true })
      return
    }
    const modal = new ModalBuilder()
      .setCustomId(`portal_edit_modal:${sessionKey}`)
      .setTitle(`Edit: ${biz.name}`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Business Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(biz.name),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('slug')
            .setLabel('Slug')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(biz.slug),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('provider_type')
            .setLabel('Provider Type')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(biz.providerType)
            .setPlaceholder('mckenzie  or  discord-only'),
        ),
      )
    await interaction.showModal(modal)
    return
  }

  if (action === 'roles') {
    await interaction.deferUpdate()
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

  if (action === 'owners') {
    await interaction.deferUpdate()
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

  if (action === 'perms') {
    await interaction.deferUpdate()
    const biz = await getBusinessById(businessId)
    if (!biz) {
      await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
      return
    }
    await interaction.editReply(buildPortalPermsView(biz, sessionKey))
    return
  }

  if (action === 'deactivate') {
    await interaction.deferUpdate()
    await deactivateBusiness(businessId, interaction.user.id)
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'deactivate_business',
      success: true,
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

  if (action === 'reactivate') {
    await interaction.deferUpdate()
    await reactivateBusiness(businessId, interaction.user.id)
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'reactivate_business',
      success: true,
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

  if (action === 'toggle') {
    await interaction.deferUpdate()
    const flag = id.split(':')[1] as keyof BusinessSettings
    await toggleBusinessSetting(businessId, flag, interaction.user.id)
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId,
      action: 'toggle_business_flag',
      success: true,
      details: { flag },
    })
    const biz = await getBusinessById(businessId)
    if (!biz) {
      await interaction.editReply({ content: 'Business not found.', components: [], embeds: [] })
      return
    }
    await interaction.editReply(buildPortalPermsView(biz, sessionKey))
    return
  }

  if (action === 'add_role') {
    const modal = new ModalBuilder()
      .setCustomId(`portal_add_role_modal:${sessionKey}`)
      .setTitle('Add Role Mapping')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('Discord Role ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Right-click the role → Copy ID'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('rank')
            .setLabel('Rank (employee / manager / owner)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('employee'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('label')
            .setLabel('Label (display name, optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('e.g. McKenzie Employee'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('is_base')
            .setLabel('Is Base Role? (yes / leave blank)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('yes'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('min_rank')
            .setLabel('Min Rank to Assign (manager / owner)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('manager'),
        ),
      )
    await interaction.showModal(modal)
    return
  }

  if (action === 'add_owner') {
    const modal = new ModalBuilder()
      .setCustomId(`portal_add_owner_modal:${sessionKey}`)
      .setTitle('Add Business Owner')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('discord_user_id')
            .setLabel('Discord User ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Right-click the user → Copy ID'),
        ),
      )
    await interaction.showModal(modal)
    return
  }

  if (action === 'set_api') {
    const biz = await getBusinessById(businessId)
    if (!biz) {
      await interaction.reply({ content: 'Business not found.', ephemeral: true })
      return
    }
    const currentApiName = String(biz.settings.apiBusinessName ?? '')
    const modal = new ModalBuilder()
      .setCustomId(`portal_set_api_modal:${sessionKey}`)
      .setTitle('Set API Business Name')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('api_name')
            .setLabel('API Business Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(currentApiName)
            .setPlaceholder('Leave blank to clear'),
        ),
      )
    await interaction.showModal(modal)
    return
  }
}
