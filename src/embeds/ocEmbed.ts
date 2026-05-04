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

function stockLines(items: OcStockItem[], status: OcStockStatus): string {
  const filtered = items.filter((i) => i.status === status)
  if (filtered.length === 0) return ''
  return `**${STATUS_EMOJI[status]} ${STATUS_LABEL[status]}** — ${filtered.length} item${filtered.length === 1 ? '' : 's'}\n${filtered.map((i) => i.name).join(' • ')}`
}

export function buildOCPublicEmbed(items: OcStockItem[], isManager: boolean) {
  const inStock = items.filter((i) => i.status === 'in_stock')
  const lowStock = items.filter((i) => i.status === 'low_stock')
  const outOfStock = items.filter((i) => i.status === 'out_of_stock')

  const container = new ContainerBuilder().setAccentColor(0x1a1a2e)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## Original Clothing\n[Browse our full shop →](${OC_WEBSITE})`)
  )

  container.addSeparatorComponents(sep())

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Stock Key**\n🟢 **In Stock** — 10+ slots available\n🟠 **Low Stock** — fewer than 10 slots open\n🔴 **Out of Stock** — no slots, no restocks`
    )
  )

  if (inStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(stockLines(items, 'in_stock'))
    )
  }

  if (lowStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(stockLines(items, 'low_stock'))
    )
  }

  if (outOfStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(stockLines(items, 'out_of_stock'))
    )
  }

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# All items include male & female versions. Special imports are not available.\n-# Out of stock items are permanently unavailable — no additional stock will be added.`
    )
  )

  const components: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] = [container]

  if (isManager) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('oc_manage_open')
          .setLabel('Manage Stock')
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Secondary)
      )
    )
  }

  return { flags: MessageFlags.IsComponentsV2, components }
}

export function buildOCManageEmbed(items: OcStockItem[]) {
  const inStock = items.filter((i) => i.status === 'in_stock')
  const lowStock = items.filter((i) => i.status === 'low_stock')
  const outOfStock = items.filter((i) => i.status === 'out_of_stock')

  const container = new ContainerBuilder().setAccentColor(0x5865f2)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## ⚙️ OC Stock Manager\nSelect an item below to change its status, or add a new item.')
  )

  if (inStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**🟢 In Stock** (${inStock.length})\n${inStock.map((i) => i.name).join(' • ')}`
      )
    )
  }

  if (lowStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**🟠 Low Stock** (${lowStock.length})\n${lowStock.map((i) => i.name).join(' • ')}`
      )
    )
  }

  if (outOfStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**🔴 Out of Stock** (${outOfStock.length})\n${outOfStock.map((i) => i.name).join(' • ')}`
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
      .setDescription(STATUS_LABEL[item.status])
  )

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []

  if (selectOptions.length > 0) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('oc_item_select')
          .setPlaceholder('Select item to edit status...')
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

  return { flags: MessageFlags.IsComponentsV2, components: [container, ...rows] }
}

export function buildOCEditItemEmbed(item: OcStockItem) {
  const container = new ContainerBuilder().setAccentColor(STATUS_COLOR[item.status])
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Edit: ${item.name}\nCurrent status: ${STATUS_EMOJI[item.status]} **${STATUS_LABEL[item.status]}**`
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
          .setCustomId(`oc_remove:${item.id}`)
          .setLabel('Remove Item')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('oc_manage')
          .setLabel('Back to list')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  }
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
