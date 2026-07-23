import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
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
import type { OcStockItem, OcStockStatus } from '../services/ocStockService'
import { safeMarkdownLinkLabel } from '../utils/escape'
import { OC_DEFAULTS } from '../services/businessMessagesService'

const OC_WEBSITE = 'https://ruubzz.wixsite.com/mysite/shop?sort=price_descending&OC+Orders=OC&page=2'

const STATUS_EMOJI: Record<OcStockStatus, string> = {
  in_stock: '🟢',
  low_stock: '🟠',
  out_of_stock: '🔴',
}

const STATUS_LABEL: Record<OcStockStatus, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
}

const STATUS_COLOR: Record<OcStockStatus, number> = {
  in_stock: 0x2ecc71,
  low_stock: 0xe67e22,
  out_of_stock: 0xe74c3c,
}

function sep(divider = true) {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(divider)
}

function itemLine(item: OcStockItem, withLinks: boolean): string {
  // Escape `]`, `(`, `)`, `\` in the item name when it goes inside a markdown
  // link — otherwise a manager could put `]` and `(...)` characters in `name`
  // to break out of the brackets and inject a different URL into the public
  // OC embed. URL is already validated to http/https in ocUrlModal.
  const label = withLinks && item.url
    ? `[${safeMarkdownLinkLabel(item.name)}](${item.url})`
    : item.name
  return `${STATUS_EMOJI[item.status]} ${label}`
}

/**
 * Discord rejects any Components-V2 message whose combined text-display
 * content exceeds 4000 characters (error 50035), and the builders don't
 * validate the total locally — so once the stock list grew large enough,
 * /oc failed at editReply time with the generic "unexpected error".
 * Budget the item sections to stay under the cap, leaving headroom for the
 * panel-link line the command appends: render markdown product links while
 * they fit, fall back to plain names when they don't, and as a last resort
 * drop trailing items behind a "+N more" note.
 */
const TEXT_BUDGET = 3800

const STATUSES: readonly OcStockStatus[] = ['in_stock', 'low_stock', 'out_of_stock']

function stockSections(items: OcStockItem[], withLinks: boolean): string[] {
  return STATUSES.map((status) => {
    const filtered = items.filter((i) => i.status === status)
    if (filtered.length === 0) return ''
    const header = `**${STATUS_EMOJI[status]} ${STATUS_LABEL[status]}** — ${filtered.length} item${filtered.length === 1 ? '' : 's'}`
    return `${header}\n${filtered.map((i) => itemLine(i, withLinks)).join('\n')}`
  }).filter((s) => s.length > 0)
}

export function buildOCPublicContainer(items: OcStockItem[]): ContainerBuilder {
  const headerText = `## Original Clothing\n[Browse our full shop →](${OC_WEBSITE})`
  const stockKeyText = `**Stock Key**\n🟢 **In Stock** — 10+ slots available\n🟠 **Low Stock** — fewer than 10 slots open\n🔴 **Out of Stock** — no slots open`
  const footerText = `-# All items include male & female versions. Special imports are not available.`

  const chrome = headerText.length + stockKeyText.length + footerText.length
  const total = (sections: string[]) =>
    chrome + sections.reduce((n, s) => n + s.length, 0)

  let sections = stockSections(items, true)
  if (total(sections) > TEXT_BUDGET) {
    // Too much text with product links — plain names, with the shop link above.
    sections = stockSections(items, false)
    sections.push(`-# Too many items to show product links — use "Browse our full shop" above.`)
  }

  let dropped = 0
  const NOTE_RESERVE = 60 // once trimming starts, leave room for the "+N more" note
  while (total(sections) > TEXT_BUDGET - (dropped > 0 ? NOTE_RESERVE : 0)) {
    // Trim the last item line off the longest section until we fit.
    const idx = sections.reduce((best, s, i) => (s.length > sections[best].length ? i : best), 0)
    const lines = sections[idx].split('\n')
    if (lines.length <= 2) break // header + one item — can't shrink further
    lines.pop()
    dropped++
    sections[idx] = lines.join('\n')
  }
  if (dropped > 0) {
    sections.push(`-# …plus ${dropped} more item${dropped === 1 ? '' : 's'} not shown.`)
  }

  const container = new ContainerBuilder().setAccentColor(0x1a1a2e)

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(stockKeyText))

  for (const section of sections) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(section))
  }

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText))

  return container
}

/** Join names ' • '-separated but stop at `max` chars, noting how many were cut —
 *  the manage panel shares the same 4000-char CV2 total-text cap as the public card. */
function clampNameList(names: string[], max = 1000): string {
  let out = ''
  let shown = 0
  for (const n of names) {
    const next = out ? `${out} • ${n}` : n
    if (next.length > max) break
    out = next
    shown++
  }
  if (shown === names.length) return out
  return shown === 0 ? `…${names.length} items` : `${out} • …+${names.length - shown} more`
}

export function buildOCManageEmbed(items: OcStockItem[]) {
  const inStock = items.filter((i) => i.status === 'in_stock')
  const lowStock = items.filter((i) => i.status === 'low_stock')
  const outOfStock = items.filter((i) => i.status === 'out_of_stock')

  const container = new ContainerBuilder().setAccentColor(0x5865f2)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## ⚙️ OC Stock Manager\nSelect an item to change its status or set its product link.')
  )

  if (inStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**🟢 In Stock** (${inStock.length})\n${clampNameList(inStock.map((i) => i.name))}`
      )
    )
  }

  if (lowStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**🟠 Low Stock** (${lowStock.length})\n${clampNameList(lowStock.map((i) => i.name))}`
      )
    )
  }

  if (outOfStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**🔴 Out of Stock** (${outOfStock.length})\n${clampNameList(outOfStock.map((i) => i.name))}`
      )
    )
  }

  if (items.length === 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('*No items yet. Add one below.*')
    )
  }

  const selectOptions = items.slice(0, 25).map((item) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(item.name)
      .setValue(item.id)
      .setEmoji(STATUS_EMOJI[item.status])
      .setDescription(item.url ? `${STATUS_LABEL[item.status]} — link set` : STATUS_LABEL[item.status])
  )

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []

  if (selectOptions.length > 0) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('oc_item_select')
          .setPlaceholder('Select item to edit...')
          .addOptions(selectOptions)
      )
    )
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('oc_add_modal')
        .setLabel('Add Item')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success)
    )
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container, ...rows] as any[] }
}

export function buildOCEditItemEmbed(item: OcStockItem) {
  const container = new ContainerBuilder().setAccentColor(STATUS_COLOR[item.status])
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Edit: ${item.name}\nStatus: ${STATUS_EMOJI[item.status]} **${STATUS_LABEL[item.status]}**\nProduct link: ${item.url ? `[set](${item.url})` : '*not set*'}`
    )
  )

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      container,
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`oc_status:${item.id}:in_stock`)
          .setLabel('In Stock')
          .setEmoji('🟢')
          .setStyle(item.status === 'in_stock' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`oc_status:${item.id}:low_stock`)
          .setLabel('Low Stock')
          .setEmoji('🟠')
          .setStyle(item.status === 'low_stock' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`oc_status:${item.id}:out_of_stock`)
          .setLabel('Out of Stock')
          .setEmoji('🔴')
          .setStyle(item.status === 'out_of_stock' ? ButtonStyle.Danger : ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`oc_url:${item.id}`)
          .setLabel('Set Product Link')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`oc_remove:${item.id}`)
          .setLabel('Remove Item')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('oc_manage')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary),
      ),
    ] as any[],
  }
}

/**
 * OC Requirements embed. Each body section reads from the optional
 * `overrides` map (keyed by `OC_*` keys defined in
 * `businessMessagesService.OC_DEFAULTS`) and falls back to the hardcoded
 * default body when no override is set. Layout, header and separators
 * stay hardcoded — only section bodies are editable.
 */
export function buildOCRequirementsEmbed(overrides?: Record<string, string>) {
  const body = (key: keyof typeof OC_DEFAULTS): string => {
    if (overrides && overrides[key]) return overrides[key]
    return OC_DEFAULTS[key].body
  }

  const container = new ContainerBuilder().setAccentColor(0x1a1a2e)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Original Clothing — Requirements')
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body('oc.requirements.eligibility'))
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body('oc.requirements.item_limits'))
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body('oc.requirements.communication'))
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body('oc.requirements.activity'))
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body('oc.requirements.licensing'))
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container] as any[] }
}

export function buildOCAddModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('oc_add_submit')
    .setTitle('Add Stock Item')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('item_name')
          .setLabel('Item Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Leather Jacket')
          .setRequired(true)
          .setMaxLength(80)
      )
    )
}

export function buildOCUrlModal(item: OcStockItem): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('item_url')
    .setLabel('Product Page URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://ruubzz.wixsite.com/mysite/product-page/...')
    .setRequired(false)
    .setMaxLength(500)

  if (item.url) input.setValue(item.url)

  return new ModalBuilder()
    .setCustomId(`oc_url_submit:${item.id}`)
    .setTitle(`Link: ${item.name.slice(0, 40)}`)
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))
}
