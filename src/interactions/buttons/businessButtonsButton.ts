import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { getBusinessById } from '../../services/portalService'
import {
  getButton,
  listButtons,
  countButtons,
  removeButton,
  moveButton,
  updateButton,
  MAX_BUTTONS_PER_BUSINESS,
  type BusinessButton,
} from '../../services/businessButtonsService'
import {
  buildButtonsManagePanel,
  buildButtonEditPanel,
  buildButtonInfoContainer,
  buildAddButtonModal,
  buildEditButtonModal,
  nextStyle,
} from '../../embeds/businessButtons'
import { registerSendable, withSendButtonV2 } from '../../utils/sendable'

const NO_PERMISSION = 'You need to be a manager of this business to manage its buttons.'

/**
 * Re-validate that the interacting member is manager+ (or sudo) for the given
 * business. Called on every management interaction — we never trust the
 * customId alone. Exported so the select and modal handlers share one check.
 */
export async function requireButtonManager(
  interaction:
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  businessId: string,
): Promise<boolean> {
  if (!interaction.guild) return false
  const member = await interaction.guild.members.fetch(interaction.user.id)
  if (isSudoUser(member)) return true
  const resolved = await resolveBusinesses(member)
  const b = resolved.find((r) => r.business.id === businessId)
  return !!(b && hasMinRank(b.rank, 'manager'))
}

/** Render the manage list into the (already-deferred) ephemeral. */
export async function renderManagePanel(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  businessId: string,
): Promise<void> {
  const [biz, buttons, count] = await Promise.all([
    getBusinessById(businessId),
    listButtons(businessId),
    countButtons(businessId),
  ])
  const name = biz?.name ?? 'Business'
  const panel = buildButtonsManagePanel(name, businessId, buttons, count >= MAX_BUTTONS_PER_BUSINESS)
  await interaction.editReply({ ...panel, content: null } as never)
}

async function renderEditPanel(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  button: BusinessButton,
): Promise<void> {
  await interaction.editReply({ ...buildButtonEditPanel(button), content: null } as never)
}

export async function handleBusinessButtonsButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':')
  const action = parts[1]

  // ── Public: reveal an info button's card ──────────────────────────────────
  if (action === 'show') {
    const id = parts[2]
    const button = await getButton(id)
    if (!button || !button.enabled || button.type !== 'info') {
      await interaction.reply({
        content: 'This button is no longer available — re-run the command and try again.',
        ephemeral: true,
      })
      return
    }
    const container = buildButtonInfoContainer(button)
    const sendKey = `bizbtn_show:${button.id}:${interaction.id}`
    registerSendable(sendKey, () => ({ components: [buildButtonInfoContainer(button)], flags: 32768 }))
    await interaction.reply(withSendButtonV2(sendKey, container))
    return
  }

  // ── Open the manage panel from a command embed (fresh ephemeral) ───────────
  if (action === 'manage_open') {
    const businessId = parts[2]
    await interaction.deferReply({ ephemeral: true })
    if (!(await requireButtonManager(interaction, businessId))) {
      await interaction.editReply({ content: NO_PERMISSION })
      return
    }
    await renderManagePanel(interaction, businessId)
    return
  }

  // ── Back to the manage list (edits the existing ephemeral) ─────────────────
  if (action === 'manage') {
    const businessId = parts[2]
    await interaction.deferUpdate()
    if (!(await requireButtonManager(interaction, businessId))) {
      await interaction.followUp({ content: NO_PERMISSION, ephemeral: true })
      return
    }
    await renderManagePanel(interaction, businessId)
    return
  }

  // ── Open the add-button modal ──────────────────────────────────────────────
  if (action === 'add') {
    const businessId = parts[2]
    const type = parts[3] === 'info' ? 'info' : 'link'
    if (!(await requireButtonManager(interaction, businessId))) {
      await interaction.reply({ content: NO_PERMISSION, ephemeral: true })
      return
    }
    if ((await countButtons(businessId)) >= MAX_BUTTONS_PER_BUSINESS) {
      await interaction.reply({
        content: `You've reached the limit of ${MAX_BUTTONS_PER_BUSINESS} buttons. Remove one before adding another.`,
        ephemeral: true,
      })
      return
    }
    await interaction.showModal(buildAddButtonModal(businessId, type))
    return
  }

  // ── Open the edit-button modal ─────────────────────────────────────────────
  if (action === 'edit') {
    const id = parts[2]
    const button = await getButton(id)
    if (!button) {
      await interaction.reply({ content: 'That button no longer exists.', ephemeral: true })
      return
    }
    if (!(await requireButtonManager(interaction, button.businessId))) {
      await interaction.reply({ content: NO_PERMISSION, ephemeral: true })
      return
    }
    await interaction.showModal(buildEditButtonModal(button))
    return
  }

  // ── State-changing actions that re-render the edit view ────────────────────
  if (action === 'style' || action === 'toggle' || action === 'up' || action === 'down') {
    const id = parts[2]
    await interaction.deferUpdate()
    const button = await getButton(id)
    if (!button) {
      await interaction.followUp({ content: 'That button no longer exists. Use Back to refresh.', ephemeral: true })
      return
    }
    if (!(await requireButtonManager(interaction, button.businessId))) {
      await interaction.followUp({ content: NO_PERMISSION, ephemeral: true })
      return
    }

    if (action === 'style' && button.type === 'info') {
      await updateButton(id, { style: nextStyle(button.style) }, interaction.user.id)
    } else if (action === 'toggle') {
      await updateButton(id, { enabled: !button.enabled }, interaction.user.id)
    } else if (action === 'up' || action === 'down') {
      await moveButton(button.businessId, id, action)
    }

    const updated = await getButton(id)
    if (updated) await renderEditPanel(interaction, updated)
    return
  }

  // ── Remove → back to the list ──────────────────────────────────────────────
  if (action === 'remove') {
    const id = parts[2]
    await interaction.deferUpdate()
    const button = await getButton(id)
    if (!button) {
      await interaction.followUp({ content: 'That button no longer exists. Use Back to refresh.', ephemeral: true })
      return
    }
    if (!(await requireButtonManager(interaction, button.businessId))) {
      await interaction.followUp({ content: NO_PERMISSION, ephemeral: true })
      return
    }
    await removeButton(id)
    await renderManagePanel(interaction, button.businessId)
    return
  }
}
