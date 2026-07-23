/**
 * Components V2 renderers + modal/row builders for the custom business-button
 * feature. Pure discord.js builders — no service or sendable imports — so this
 * module can be consumed from both the command paths and the interaction
 * handlers without cycles.
 *
 * customId scheme (all routed in `bot/events/interactionCreate.ts`):
 *   Buttons   `bizbtn:{action}:{...}`
 *     show:{id}                  public — reveal an info button's card
 *     manage_open:{businessId}   open the manage panel (fresh ephemeral)
 *     manage:{businessId}        back to the manage list (edits in place)
 *     add:{businessId}:{type}    open the add-button modal
 *     edit:{id}                  open the edit-button modal
 *     style:{id}                 cycle an info button's colour
 *     toggle:{id}                enable/disable a button
 *     up:{id} / down:{id}        reorder
 *     remove:{id}                delete
 *   Select    `bizbtn_select:{businessId}` — pick a button to edit
 *   Modals    `bizbtn_add_submit:{businessId}:{type}`
 *             `bizbtn_edit_submit:{id}`
 */
import {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { sep } from '../utils/cv2'
import {
  type BusinessButton,
  type BusinessButtonStyle,
  type BusinessButtonType,
  BUTTON_STYLES,
  MAX_BODY_LEN,
  MAX_EMOJI_LEN,
  MAX_LABEL_LEN,
  MAX_URL_LEN,
} from '../services/businessButtonsService'

const MANAGE_ACCENT = 0x5865f2
const INFO_ACCENT = 0x1a1a2e

const STYLE_MAP: Record<BusinessButtonStyle, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
}

const STYLE_LABEL: Record<BusinessButtonStyle, string> = {
  primary: 'Blurple',
  secondary: 'Grey',
  success: 'Green',
  danger: 'Red',
}

const TYPE_ICON: Record<BusinessButtonType, string> = {
  link: '🔗',
  info: '📄',
}

/** Next style in the cycle — used by the in-Discord style toggle. */
export function nextStyle(style: BusinessButtonStyle): BusinessButtonStyle {
  const i = BUTTON_STYLES.indexOf(style)
  return BUTTON_STYLES[(i + 1) % BUTTON_STYLES.length]
}

/** The manager-only "Manage Buttons" affordance appended to a command embed. */
export function manageButtonsButton(businessId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`bizbtn:manage_open:${businessId}`)
    .setLabel('Manage Buttons')
    .setEmoji('⚙️')
    .setStyle(ButtonStyle.Secondary)
}

/**
 * Apply a stored emoji string to a button defensively. Custom emoji come in as
 * `<a?:name:id>`; everything else is treated as unicode. A malformed value is
 * silently dropped rather than letting one bad emoji 50035 the whole message.
 */
function applyEmoji(btn: ButtonBuilder, emoji: string | null | undefined): void {
  if (!emoji) return
  const m = emoji.match(/^<(a)?:([A-Za-z0-9_]+):(\d+)>$/)
  try {
    if (m) btn.setEmoji({ name: m[2], id: m[3], animated: Boolean(m[1]) })
    else btn.setEmoji(emoji)
  } catch {
    /* ignore unresolvable emoji */
  }
}

/**
 * Lay enabled buttons out into action rows of 5, in configured order. Link
 * buttons become Discord link buttons (no round trip); info buttons carry the
 * `bizbtn:show:{id}` custom id. Returns `[]` when there are no enabled
 * buttons so callers can spread the result unconditionally.
 */
export function buildCustomButtonRows(
  buttons: BusinessButton[],
): ActionRowBuilder<ButtonBuilder>[] {
  // Skip rows the panel could have written with an empty label, and fall back
  // to Secondary on an unknown style — one bad row must not 50035 the command.
  const enabled = buttons.filter((b) => b.enabled && b.label.trim().length > 0)
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  for (let i = 0; i < enabled.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    for (const b of enabled.slice(i, i + 5)) {
      const btn = new ButtonBuilder().setLabel(b.label.slice(0, MAX_LABEL_LEN))
      applyEmoji(btn, b.emoji)
      if (b.type === 'link' && b.url) {
        btn.setStyle(ButtonStyle.Link).setURL(b.url)
      } else {
        btn.setStyle(STYLE_MAP[b.style] ?? ButtonStyle.Secondary).setCustomId(`bizbtn:show:${b.id}`)
      }
      row.addComponents(btn)
    }
    rows.push(row)
  }
  return rows
}

/** The card an `info` button reveals when clicked. */
export function buildButtonInfoContainer(button: BusinessButton): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(INFO_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(button.body && button.body.trim().length > 0 ? button.body : '*No content set for this button yet.*'),
    )
}

function buttonSummary(b: BusinessButton): string {
  const icon = TYPE_ICON[b.type]
  const state = b.enabled ? '' : ' · *disabled*'
  const target =
    b.type === 'link'
      ? b.url
        ? `→ ${b.url}`
        : '→ *(no link set)*'
      : b.body && b.body.trim().length > 0
        ? '→ info card'
        : '→ *(empty card)*'
  const emoji = b.emoji ? `${b.emoji} ` : ''
  return `${icon} **${emoji}${b.label}** ${target}${state}`
}

/**
 * The manage panel: ordered list + a select to pick one for editing + Add
 * buttons. Returned as a ready-to-send Components V2 payload.
 */
export function buildButtonsManagePanel(
  businessName: string,
  businessId: string,
  buttons: BusinessButton[],
  atLimit: boolean,
) {
  const container = new ContainerBuilder().setAccentColor(MANAGE_ACCENT)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⚙️ ${businessName} — Custom Buttons\nButtons added here show up on the command for everyone. Pick one below to edit, or add a new one.`,
    ),
  )

  container.addSeparatorComponents(sep())
  if (buttons.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('*No custom buttons yet. Add a link or an info button below.*'),
    )
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buttons.map((b, i) => `${i + 1}. ${buttonSummary(b)}`).join('\n')),
    )
  }

  if (atLimit) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Button limit reached — remove one before adding another.'),
    )
  }

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []

  if (buttons.length > 0) {
    const options = buttons.slice(0, 25).map((b) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(b.label.slice(0, 100))
        .setValue(b.id)
        .setEmoji(TYPE_ICON[b.type])
        .setDescription(
          (b.type === 'link' ? 'Link button' : 'Info button') + (b.enabled ? '' : ' (disabled)'),
        ),
    )
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`bizbtn_select:${businessId}`)
          .setPlaceholder('Select a button to edit…')
          .addOptions(options),
      ),
    )
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bizbtn:add:${businessId}:link`)
        .setLabel('Add Link')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Success)
        .setDisabled(atLimit),
      new ButtonBuilder()
        .setCustomId(`bizbtn:add:${businessId}:info`)
        .setLabel('Add Info')
        .setEmoji('📄')
        .setStyle(ButtonStyle.Success)
        .setDisabled(atLimit),
    ),
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container, ...rows] as unknown[] }
}

/** The edit view for a single button. */
export function buildButtonEditPanel(button: BusinessButton) {
  const container = new ContainerBuilder().setAccentColor(MANAGE_ACCENT)
  const lines = [
    `## Edit: ${TYPE_ICON[button.type]} ${button.label}`,
    `Type: **${button.type === 'link' ? 'Link button' : 'Info button'}**`,
    button.type === 'link'
      ? `Link: ${button.url ? button.url : '*not set*'}`
      : `Colour: **${STYLE_LABEL[button.style]}**`,
    `Emoji: ${button.emoji ? button.emoji : '*none*'}`,
    `State: ${button.enabled ? '🟢 Enabled' : '⚪ Disabled'}`,
  ]
  if (button.type === 'info') {
    lines.push('', button.body && button.body.trim().length > 0 ? '**Preview**' : '*Card body is empty — edit to add content.*')
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
  if (button.type === 'info' && button.body && button.body.trim().length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(button.body.slice(0, 1500)))
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  if (button.type === 'info') {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`bizbtn:style:${button.id}`)
          .setLabel(`Colour: ${STYLE_LABEL[button.style]}`)
          .setEmoji('🎨')
          .setStyle(STYLE_MAP[button.style]),
      ),
    )
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bizbtn:edit:${button.id}`)
        .setLabel('Edit')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`bizbtn:toggle:${button.id}`)
        .setLabel(button.enabled ? 'Disable' : 'Enable')
        .setEmoji(button.enabled ? '🚫' : '✅')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`bizbtn:up:${button.id}`)
        .setLabel('Up')
        .setEmoji('⬆️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`bizbtn:down:${button.id}`)
        .setLabel('Down')
        .setEmoji('⬇️')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bizbtn:remove:${button.id}`)
        .setLabel('Remove')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`bizbtn:manage:${button.businessId}`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container, ...rows] as unknown[] }
}

/** Add-button modal. `type` is encoded in the customId and fixed for the row. */
export function buildAddButtonModal(businessId: string, type: BusinessButtonType): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`bizbtn_add_submit:${businessId}:${type}`)
    .setTitle(type === 'link' ? 'Add Link Button' : 'Add Info Button')

  const rows: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('label')
        .setLabel('Button label')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(type === 'link' ? 'e.g. Order Form' : 'e.g. Hours & Location')
        .setRequired(true)
        .setMaxLength(MAX_LABEL_LEN),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('emoji')
        .setLabel('Emoji (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('🛒  or  <:name:123456789>')
        .setRequired(false)
        .setMaxLength(MAX_EMOJI_LEN),
    ),
  ]

  if (type === 'link') {
    rows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('url')
          .setLabel('Link URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://…')
          .setRequired(true)
          .setMaxLength(MAX_URL_LEN),
      ),
    )
  } else {
    rows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('body')
          .setLabel('Card content (shown when clicked)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Markdown is supported.')
          .setRequired(true)
          .setMaxLength(MAX_BODY_LEN),
      ),
    )
  }

  return modal.addComponents(...rows)
}

/** Edit-button modal, prefilled. */
export function buildEditButtonModal(button: BusinessButton): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`bizbtn_edit_submit:${button.id}`)
    .setTitle(`Edit: ${button.label.slice(0, 40)}`)

  const labelInput = new TextInputBuilder()
    .setCustomId('label')
    .setLabel('Button label')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(MAX_LABEL_LEN)
    .setValue(button.label)

  const emojiInput = new TextInputBuilder()
    .setCustomId('emoji')
    .setLabel('Emoji (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(MAX_EMOJI_LEN)
  if (button.emoji) emojiInput.setValue(button.emoji)

  const rows: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(labelInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(emojiInput),
  ]

  if (button.type === 'link') {
    const urlInput = new TextInputBuilder()
      .setCustomId('url')
      .setLabel('Link URL')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(MAX_URL_LEN)
    if (button.url) urlInput.setValue(button.url)
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput))
  } else {
    const bodyInput = new TextInputBuilder()
      .setCustomId('body')
      .setLabel('Card content (shown when clicked)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(MAX_BODY_LEN)
    if (button.body) bodyInput.setValue(button.body)
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(bodyInput))
  }

  return modal.addComponents(...rows)
}
