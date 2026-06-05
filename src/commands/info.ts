import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { getAllBusinesses, type BusinessRecord } from '../services/portalService'
import { listEnabledButtons } from '../services/businessButtonsService'
import { buildCustomButtonRows, manageButtonsButton } from '../embeds/businessButtons'
import { registerSendable, withSendButtonV2Rows } from '../utils/sendable'
import { sep } from '../utils/cv2'

// Businesses with their own richer command surface are excluded from /info —
// their managers get custom buttons on /oc and /caked instead. MKE is excluded
// implicitly by the discord-only filter.
const DEDICATED_COMMAND_SLUGS = new Set(['original-clothing', 'caked-up'])

const INFO_ACCENT = 0x1a1a2e

export const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('View a business and its quick links')
  .setDMPermission(false)
  .addStringOption((opt) =>
    opt
      .setName('business')
      .setDescription('Which business?')
      .setRequired(true)
      .setAutocomplete(true),
  )

/** Active, discord-only businesses that don't have a dedicated command. */
function infoBusinesses(all: BusinessRecord[]): BusinessRecord[] {
  return all.filter(
    (b) => b.active && b.providerType === 'discord-only' && !DEDICATED_COMMAND_SLUGS.has(b.slug),
  )
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([])
    return
  }
  const focused = interaction.options.getFocused().toLowerCase()
  let businesses: BusinessRecord[] = []
  try {
    businesses = infoBusinesses(await getAllBusinesses(interaction.guildId))
  } catch {
    businesses = []
  }
  const matches = businesses
    .filter((b) => !focused || b.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((b) => ({ name: b.name, value: b.slug }))
  await interaction.respond(matches)
}

function infoContainer(biz: BusinessRecord): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(INFO_ACCENT)
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${biz.name}`))
  const description =
    biz.settings && typeof biz.settings.description === 'string'
      ? (biz.settings.description as string)
      : null
  if (description && description.trim().length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
  }
  return container
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const slug = interaction.options.getString('business', true)
  const all = await getAllBusinesses(interaction.guild.id)
  const biz = infoBusinesses(all).find((b) => b.slug === slug)
  if (!biz) {
    await interaction.editReply({
      content: 'That business is not available. Pick one from the suggestions.',
    })
    return
  }

  // Manager-or-sudo gets the Manage Buttons affordance. Best-effort.
  let isManager = false
  try {
    const member = await interaction.guild.members.fetch(interaction.user.id)
    isManager = isSudoUser(member)
    if (!isManager) {
      const resolved = await resolveBusinesses(member)
      const r = resolved.find((rb) => rb.business.id === biz.id)
      isManager = !!(r && hasMinRank(r.rank, 'manager'))
    }
  } catch {
    isManager = false
  }

  const buttons = await listEnabledButtons(biz.id)
  const container = infoContainer(biz)
  const customRows = buildCustomButtonRows(buttons)

  const sendKey = `info:${biz.slug}:${interaction.id}`
  registerSendable(sendKey, () => ({
    components: [infoContainer(biz), ...buildCustomButtonRows(buttons)],
    flags: 32768,
  }))

  const trailing: ButtonBuilder[] = isManager ? [manageButtonsButton(biz.id)] : []
  await interaction.editReply({
    ...withSendButtonV2Rows(sendKey, container, customRows as ActionRowBuilder<ButtonBuilder>[], trailing),
    content: null,
  } as never)
}
