import {
  type ButtonInteraction,
  type Message,
  type TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,


  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { sepLarge } from '../../utils/cv2'
import { storeLookupSession } from '../../services/interactionCache'
import { buildTicketCharacterEmbed } from '../../embeds/ticketCharacterEmbed'
import { fetchCharacters, getMckenzieBusinessId } from '../../services/ticketLookup'

const RETRY_COOLDOWN_MS = 4 * 60 * 1000
const RETRY_MAP_MAX = 1000
const lastRetry = new Map<string, number>()

const HELP_COOLDOWN_MS = 10 * 60 * 1000
const lastHelp = new Map<string, number>()

const HELP_ROLE_ID ='1308966159516827688'
const SIGNUP_URL = 'https://mke.euphoric.gg/account'
const SUPPRESS_NOTIFICATIONS = 1 << 12

/** Cap the rate-limit map size — Map keys are user IDs and we never delete
 *  entries on their own, so without a cap a busy server's map grows
 *  unbounded over the bot's lifetime. When we hit the cap, drop the oldest
 *  insertion (Map iteration is insertion-ordered). */
function rememberRetry(userId: string): void {
  if (lastRetry.size >= RETRY_MAP_MAX) {
    const oldest = lastRetry.keys().next().value
    if (oldest) lastRetry.delete(oldest)
  }
  lastRetry.set(userId, Date.now())
}

function rememberHelp(channelId: string): void {
  if (lastHelp.size >= RETRY_MAP_MAX) {
    const oldest = lastHelp.keys().next().value
    if (oldest) lastHelp.delete(oldest)
  }
  lastHelp.set(channelId, Date.now())
}

interface LooseComponent {
  customId?: string
  components?: LooseComponent[]
}

function hasButton(components: LooseComponent[] | undefined, customId: string): boolean {
  if (!components) return false
  for (const c of components) {
    if (c.customId === customId) return true
    if (hasButton(c.components, customId)) return true
  }
  return false
}

/**
 * The public ticket message carrying the Account Made button for this user.
 * On a normal click that is the clicked message; on the ephemeral Retry the
 * clicked message is the ephemeral itself (it cannot become the ticket card),
 * so fall back to the newest bot-authored message in the channel that holds
 * `ticket_account_made:{targetDiscordId}`.
 */
export async function findPublicTicketMessage(
  interaction: ButtonInteraction,
  targetDiscordId: string,
): Promise<Message | null> {
  const clicked = interaction.message
  const ephemeral = !!clicked?.flags?.has?.(MessageFlags.Ephemeral)
  if (clicked && !ephemeral) return clicked
  const channel = interaction.channel as TextChannel | null
  if (!channel?.messages) return null
  const botId = interaction.client?.user?.id
  const wanted = `ticket_account_made:${targetDiscordId}`
  try {
    const recent = await channel.messages.fetch({ limit: 50 })
    let best: Message | null = null
    for (const msg of recent.values()) {
      if (!botId || msg.author?.id !== botId) continue
      if (!hasButton(msg.components as unknown as LooseComponent[], wanted)) continue
      if (!best || msg.createdTimestamp > best.createdTimestamp) best = msg
    }
    return best
  } catch (err) {
    console.error('Failed to search for the ticket message:', err)
    return null
  }
}

function buildNoAccountEphemeral(targetDiscordId: string) {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setLabel('Website').setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(SIGNUP_URL),
    new ButtonBuilder()
      .setCustomId(`ticket_account_help:${targetDiscordId}`)
      .setLabel('Ask for Help')
      .setEmoji('🆘')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_account_made:${targetDiscordId}`)
      .setLabel('Retry')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Primary),
  )
  return {
    content: 'Still no character linked. Make sure you assigned one at the website, then click **Retry**. If you need a hand, click **Ask for Help** — that pings the Printing Press Operator team in this ticket.',
    components: [row],
    flags: MessageFlags.Ephemeral,
  }
}

/**
 * `ticket_account_made:{targetDiscordId}` — re-runs the character lookup the
 * automatic ticket message originally did. Same handler is reused for the
 * Retry button on the no-account ephemeral. Rate-limited per user to once
 * every 4 minutes so people can't spam the API.
 */
export async function handleTicketAccountMadeButton(interaction: ButtonInteraction): Promise<void> {
  const targetDiscordId = interaction.customId.split(':')[1]
  if (!targetDiscordId) return

  // Only the user we're asking about (or staff) can confirm.
  if (interaction.user.id !== targetDiscordId) {
    const member = interaction.guild?.members.cache.get(interaction.user.id)
      ?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null)
    const canBypass = !!member?.permissions.has('ManageChannels')
    if (!canBypass) {
      await interaction.reply({ content: '❌ Only the ticket creator (or staff) can confirm this.', ephemeral: true })
      return
    }
  }

  // Rate limit (per user)
  const last = lastRetry.get(interaction.user.id) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < RETRY_COOLDOWN_MS) {
    const waitSec = Math.ceil((RETRY_COOLDOWN_MS - elapsed) / 1000)
    await interaction.reply({
      content: `⏳ Hang on — try again in ${waitSec}s. (Limited to once every 4 minutes.)`,
      ephemeral: true,
    })
    return
  }
  rememberRetry(interaction.user.id)

  await interaction.deferReply({ ephemeral: true })

  let characters: Awaited<ReturnType<typeof fetchCharacters>>
  try {
    characters = await fetchCharacters(targetDiscordId)
  } catch (err) {
    console.error('Account-Made re-lookup failed:', err)
    await interaction.editReply({ content: '⚠️ Could not reach the API. Try again in a moment.' })
    return
  }

  if (characters.length === 0) {
    await interaction.editReply(buildNoAccountEphemeral(targetDiscordId) as any)
    return
  }

  // Found at least one character — replace the original "no character linked"
  // message in-channel with the proper character embed/selector, then ack.
  const channel = interaction.channel as TextChannel | null
  const businessId = channel?.guildId ? await getMckenzieBusinessId(channel.guildId) : null

  let payload: any
  if (characters.length === 1) {
    const character = characters[0]
    const sessionKey = businessId
      ? await storeLookupSession({
          characterId: character.id,
          characterName: character.name,
          characterCsn: character.csn,
          businessId,
          targetDiscordId,
          rank: 'employee',
        })
      : undefined
    payload = buildTicketCharacterEmbed(character, targetDiscordId, { sessionKey, lookupMethod: 'discord' })
  } else {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`ticket_char_select:${targetDiscordId}`)
      .setPlaceholder('Select your character')
      .addOptions(
        characters.map(c =>
          new StringSelectMenuOptionBuilder()
            .setLabel(c.name)
            .setDescription(c.csn ? `CSN: ${c.csn}` : 'No CSN on record')
            .setValue(c.id),
        ),
      )
    payload = {
      components: [
        new ContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `<@${targetDiscordId}> We found multiple characters linked to your account. Please select yours below.`,
            ),
          )
          .addSeparatorComponents(
            sepLarge(),
          )
          .addActionRowComponents(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
          ),
      ] as any[],
      flags: MessageFlags.IsComponentsV2,
    }
  }

  const target = await findPublicTicketMessage(interaction, targetDiscordId)
  let edited = false
  if (target) {
    try {
      await target.edit(payload)
      edited = true
    } catch (err) {
      console.error('Failed to edit ticket message:', err)
    }
  }

  if (edited) {
    await interaction.editReply({ content: '✅ Found your character — updated the ticket message.' })
    return
  }

  // Could not update the public message: show the card here instead. The
  // payload is Components V2 (no `content`); the deferred reply is already
  // ephemeral so no explicit ephemeral flag.
  await interaction.editReply({ components: payload.components, flags: MessageFlags.IsComponentsV2 } as any)
}

/**
 * `ticket_account_help:{targetDiscordId}` — posts a silent message in the
 * ticket channel pinging the Printing Press Operator role for hands-on help.
 */
export async function handleTicketAccountHelpButton(interaction: ButtonInteraction): Promise<void> {
  const targetDiscordId = interaction.customId.split(':')[1]
  if (!targetDiscordId) return

  const channel = interaction.channel as TextChannel | null
  if (!channel) {
    await interaction.reply({ content: '❌ Could not find the channel.', ephemeral: true })
    return
  }

  // Same auth as Account Made: the ticket subject or ManageChannels staff.
  if (interaction.user.id !== targetDiscordId) {
    const member = interaction.guild?.members.cache.get(interaction.user.id)
      ?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null)
    if (!member?.permissions.has('ManageChannels')) {
      await interaction.reply({ content: '❌ Only the ticket creator (or staff) can ask for help here.', ephemeral: true })
      return
    }
  }

  // Per-channel cooldown so the role is pinged at most once per window.
  const last = lastHelp.get(channel.id) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < HELP_COOLDOWN_MS) {
    const waitMin = Math.ceil((HELP_COOLDOWN_MS - elapsed) / 60000)
    await interaction.reply({
      content: `⏳ The team was already pinged in this ticket. Try again in about ${waitMin} min.`,
      ephemeral: true,
    })
    return
  }
  rememberHelp(channel.id)

  await channel.send({
    content: `<@&${HELP_ROLE_ID}> — <@${targetDiscordId}> needs help linking their character.`,
    flags: SUPPRESS_NOTIFICATIONS,
    allowedMentions: { roles: [HELP_ROLE_ID], users: [targetDiscordId] },
  } as any)

  await interaction.reply({
    content: '🆘 Pinged the team in this ticket — someone will be with you shortly.',
    ephemeral: true,
  })
}
