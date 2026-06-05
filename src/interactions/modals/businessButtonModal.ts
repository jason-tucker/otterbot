import { type ModalSubmitInteraction } from 'discord.js'
import { parseHttpUrl } from '../../utils/validators'
import {
  addButton,
  getButton,
  updateButton,
  MAX_BUTTONS_PER_BUSINESS,
  type BusinessButtonType,
} from '../../services/businessButtonsService'
import {
  requireButtonManager,
  renderManagePanel,
} from '../buttons/businessButtonsButton'

const NO_PERMISSION = 'You need to be a manager of this business to manage its buttons.'

function getField(interaction: ModalSubmitInteraction, id: string): string {
  try {
    return interaction.fields.getTextInputValue(id).trim()
  } catch {
    return ''
  }
}

/**
 * Re-render the manage panel after a successful add/edit. Modals shown from a
 * message component report `isFromMessage()` true, letting us edit the panel
 * in place; otherwise we open a fresh ephemeral.
 */
async function showManageResult(
  interaction: ModalSubmitInteraction,
  businessId: string,
): Promise<void> {
  if (interaction.isFromMessage()) {
    await interaction.deferUpdate()
  } else {
    await interaction.deferReply({ ephemeral: true })
  }
  await renderManagePanel(interaction, businessId)
}

export async function handleBusinessButtonModal(interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId
  const parts = id.split(':')

  // ── Add: bizbtn_add_submit:{businessId}:{type} ─────────────────────────────
  if (parts[0] === 'bizbtn_add_submit') {
    const businessId = parts[1]
    const type: BusinessButtonType = parts[2] === 'info' ? 'info' : 'link'

    if (!(await requireButtonManager(interaction, businessId))) {
      await interaction.reply({ content: NO_PERMISSION, ephemeral: true })
      return
    }

    const label = getField(interaction, 'label')
    const emoji = getField(interaction, 'emoji') || null
    if (!label) {
      await interaction.reply({ content: 'A button label is required.', ephemeral: true })
      return
    }

    let url: string | null = null
    let body: string | null = null
    if (type === 'link') {
      const raw = getField(interaction, 'url')
      url = parseHttpUrl(raw)
      if (!url) {
        await interaction.reply({ content: 'That link must be a valid http(s) URL.', ephemeral: true })
        return
      }
    } else {
      body = getField(interaction, 'body')
      if (!body) {
        await interaction.reply({ content: 'Card content is required for an info button.', ephemeral: true })
        return
      }
    }

    const result = await addButton(businessId, { type, label, emoji, url, body }, interaction.user.id)
    if (!result.ok) {
      await interaction.reply({
        content: `You've reached the limit of ${MAX_BUTTONS_PER_BUSINESS} buttons. Remove one before adding another.`,
        ephemeral: true,
      })
      return
    }

    await showManageResult(interaction, businessId)
    return
  }

  // ── Edit: bizbtn_edit_submit:{id} ──────────────────────────────────────────
  if (parts[0] === 'bizbtn_edit_submit') {
    const buttonId = parts[1]
    const button = await getButton(buttonId)
    if (!button) {
      await interaction.reply({ content: 'That button no longer exists.', ephemeral: true })
      return
    }
    if (!(await requireButtonManager(interaction, button.businessId))) {
      await interaction.reply({ content: NO_PERMISSION, ephemeral: true })
      return
    }

    const label = getField(interaction, 'label')
    const emoji = getField(interaction, 'emoji') || null
    if (!label) {
      await interaction.reply({ content: 'A button label is required.', ephemeral: true })
      return
    }

    const patch: Parameters<typeof updateButton>[1] = { label, emoji }
    if (button.type === 'link') {
      const url = parseHttpUrl(getField(interaction, 'url'))
      if (!url) {
        await interaction.reply({ content: 'That link must be a valid http(s) URL.', ephemeral: true })
        return
      }
      patch.url = url
    } else {
      const body = getField(interaction, 'body')
      if (!body) {
        await interaction.reply({ content: 'Card content is required for an info button.', ephemeral: true })
        return
      }
      patch.body = body
    }

    await updateButton(buttonId, patch, interaction.user.id)
    await showManageResult(interaction, button.businessId)
    return
  }
}
