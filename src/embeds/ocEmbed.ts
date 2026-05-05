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

function itemLine(item: OcStockItem): string {
  const label = item.url ? `[${item.name}](${item.url})` : item.name
  return `${STATUS_EMOJI[item.status]} ${label}`
}

function stockSection(items: OcStockItem[], status: OcStockStatus): string {
  const filtered = items.filter((i) => i.status === status)
  if (filtered.length === 0) return ''
  const header = `**${STATUS_EMOJI[status]} ${STATUS_LABEL[status]}** — ${filtered.length} item${filtered.length === 1 ? '' : 's'}`
  return `${header}\n${filtered.map(itemLine).join('\n')}`
}

export function buildOCPublicContainer(items: OcStockItem[]): ContainerBuilder {
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
      `**Stock Key**\n🟢 **In Stock** — 10+ slots available\n🟠 **Low Stock** — fewer than 10 slots open\n🔴 **Out of Stock** — no slots open`
    )
  )

  if (inStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(stockSection(items, 'in_stock'))
    )
  }

  if (lowStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(stockSection(items, 'low_stock'))
    )
  }

  if (outOfStock.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(stockSection(items, 'out_of_stock'))
    )
  }

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# All items include male & female versions. Special imports are not available.`
    )
  )

  return container
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

const FORUMS_URL = 'https://newdayrp.com/forums/gangs-criminal-organizations.67/'

export function buildOCRequirementsEmbed() {
  const container = new ContainerBuilder().setAccentColor(0x1a1a2e)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Original Clothing — Requirements')
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Eligibility**\n` +
      `- Businesses require at least **5 active staff members**; MC/Groups require **8 active members**\n` +
      `- A valid **Social Club license** and **Business & Premises license** are required\n` +
      `- Gangs/organizations must have been active for at least **30 days**\n` +
      `- Recommended: maintain an [active forum post](${FORUMS_URL}) for your gang or organization`
    )
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Item Limits**\n` +
      `- Each group starts with a maximum of **3 clothing items** — this is a hard limit\n` +
      `- Groups earn **+1 item per year of activity**, up to a maximum of **5 items total**`
    )
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Communication & Vetting**\n` +
      `- OC requires direct communication with the **owner or leader** of your group\n` +
      `- We work with the Department of Commerce and Labor and run **background checks** on every order to verify activity`
    )
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Activity & Removal**\n` +
      `- Activity checks are conducted **weekly or bi-weekly**\n` +
      `- If your activity or member count falls below requirements, you'll be given a **2-week deadline** to recover\n` +
      `- **1 month of inactivity** will result in clothing removal — contact us beforehand if inactivity is planned\n` +
      `- If your Social Club/Business & Premises license is **terminated**, clothing is removed immediately\n` +
      `- OC reserves the right to remove clothing **with or without notice** for valid reasons (activity, licensing, federal)`
    )
  )

  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Licensing**\n` +
      `-# By authorizing use of your assets on NewDayRP, you permanently and irrevocably waive your copyright and related rights for use on NewDayRP. Asset removal may be requested and will be honoured at OC's discretion.`
    )
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
