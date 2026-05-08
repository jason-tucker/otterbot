import {
  type ButtonInteraction,
  type TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { env } from '../../config/env'
import { db } from '../../db/client'
import { businesses } from '../../db/schema'
import { and, eq } from 'drizzle-orm'
import { storeLookupSession } from '../../services/interactionCache'
import { buildTicketCharacterEmbed } from '../../embeds/ticketCharacterEmbed'

const RETRY_COOLDOWN_MS = 4 * 60 * 1000
const lastRetry = new Map<string, number>()

const HELP_ROLE_ID = '1308966159516827688'
const SIGNUP_URL = 'https://mke.euphoric.gg/account'
const SUPPRESS_NOTIFICATIONS = 1 << 12

interface MkCharacterProfile {
  id: string
  status: boolean
  name: string
  csn: string
  dob: string | null
  phoneNumber: string
  bankNumber: string
}

async function fetchCharacters(discordId: string) {
  const res = await fetch(
    `${env.EUPHORIC_API_BASE_URL}/character-profiles/discord/${encodeURIComponent(discordId)}`,
    { headers: { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY }, signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) return []
  const data = await res.json() as MkCharacterProfile[]
  if (!Array.isArray(data)) return []
  return data.filter(p => p.status).map(p => ({
    id: p.id,
    name: p.name,
    csn: p.csn || null,
    phoneNumber: p.phoneNumber || null,
    bankNumber: p.bankNumber || null,
  }))
}

async function getMckenzieBusinessId(guildId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(
      eq(businesses.providerType, 'mckenzie'),
      eq(businesses.guildId, guildId),
      eq(businesses.active, true),
    ))
    .limit(1)
  return row?.id ?? null
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
  lastRetry.set(interaction.user.id, Date.now())

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
  const originalMsg = interaction.message

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
    const payload = buildTicketCharacterEmbed(character, targetDiscordId, { sessionKey, lookupMethod: 'discord' })
    await originalMsg?.edit(payload as any).catch(err => console.error('Failed to edit ticket message:', err))
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
    await originalMsg?.edit({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `<@${targetDiscordId}> We found multiple characters linked to your account. Please select yours below.`,
            ),
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
          )
          .addActionRowComponents(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
          ),
      ] as any[],
      flags: MessageFlags.IsComponentsV2,
    } as any).catch(err => console.error('Failed to edit ticket message:', err))
  }

  await interaction.editReply({ content: '✅ Found your character — updated the message above.' })
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
