import {
  ChannelType,
  type Client,
  type TextChannel,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,


  MessageFlags,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { sepLarge } from '../../utils/cv2'

const SUPPRESS_NOTIFICATIONS = 1 << 12
import { buildTicketCharacterEmbed } from '../../embeds/ticketCharacterEmbed'
import { storeLookupSession } from '../../services/interactionCache'
import { tryAcquireOnce } from '../../services/eventBus'
import {
  TICKET_BOT_USER_ID,
  TICKET_CATEGORY_ID,
  fetchCharacters,
  getMckenzieBusinessId,
} from '../../services/ticketLookup'

// channelId → registered-at timestamp. Ticket Tool normally posts its intro
// message within seconds of creating the channel; if it never does (deleted
// ticket, third-party hiccup), the entry would previously sit in the set for
// the bot's lifetime. Entries now expire after 30 minutes and are also
// dropped when the channel itself is deleted.
const pendingTicketChannels = new Map<string, number>()
const PENDING_TICKET_TTL_MS = 30 * 60 * 1000

function prunePendingTicketChannels(): void {
  const cutoff = Date.now() - PENDING_TICKET_TTL_MS
  for (const [id, at] of pendingTicketChannels) {
    if (at < cutoff) pendingTicketChannels.delete(id)
  }
}

// ---------------------------------------------------------------------------
// Cross-process de-dup guard for the auto-lookup post
//
// `pendingTicketChannels` above is race-free *within* one process — the map
// entry is deleted synchronously, before any `await`. That's not enough: on
// a watchtower deploy the old and new bot containers briefly run in
// parallel on the SAME Discord bot token (see commit 18bcfd0, "otterbot
// deploy tolerates the watchtower recreate race"). Both gateway sessions
// receive the same channelCreate + messageCreate pair and each has its own,
// independent in-memory Map — neither can see the other claimed the ticket
// already. That's the reported bug: the "create an account" card (and,
// less visibly, the character embed / selector) posting twice.
//
// The fix takes a short Redis lock (`tryAcquireOnce`, see eventBus.ts)
// keyed by channel before either instance does any work. Only one instance
// wins; the other returns silently. If Redis itself is unavailable (e.g.
// local dev), we fail open but fall back to a best-effort history scan so a
// duplicate is at least unlikely.
// ---------------------------------------------------------------------------

const AUTO_LOOKUP_LOCK_TTL_SECONDS = 600

// CustomId prefixes that only ever appear on a message this auto-lookup flow
// produced (directly, or via the Retry/Ask-for-Help follow-ups on the
// no-account card).
const AUTO_LOOKUP_CUSTOM_ID_PREFIXES = [
  'ticket_account_made:',
  'ticket_account_help:',
  'ticket_char_select:',
] as const

// The literal footer stamped on both the "no characters" card (below) and
// the single-character embed (`buildTicketCharacterEmbed` in
// src/embeds/ticketCharacterEmbed.ts) — the one shape (the character-select
// menu) that carries no distinguishing customId still doesn't need this
// marker, since it has its own prefix above; this covers the other two.
const AUTO_LOOKUP_FOOTER_MARKER = '-# via Otterbot'

interface LooseComponent {
  customId?: string
  content?: string
  components?: LooseComponent[]
}

function componentsContainAutoLookupMarker(components: LooseComponent[] | undefined): boolean {
  if (!components) return false
  for (const component of components) {
    if (
      component.customId &&
      AUTO_LOOKUP_CUSTOM_ID_PREFIXES.some((prefix) => component.customId!.startsWith(prefix))
    ) {
      return true
    }
    if (component.content === AUTO_LOOKUP_FOOTER_MARKER) return true
    if (componentsContainAutoLookupMarker(component.components)) return true
  }
  return false
}

/**
 * Best-effort fallback used only when the Redis lock is unavailable
 * (`tryAcquireOnce` returned `null`). Scans the channel's recent history for
 * a message we already posted that matches one of the three auto-lookup
 * shapes. Never throws — any fetch failure just lets the caller proceed.
 */
async function hasExistingAutoLookupPost(channel: TextChannel): Promise<boolean> {
  try {
    const botId = channel.client.user?.id
    if (!botId) return false
    const recent = await channel.messages.fetch({ limit: 25 })
    for (const msg of recent.values()) {
      if (msg.author.id !== botId) continue
      if (componentsContainAutoLookupMarker(msg.components as unknown as LooseComponent[])) {
        return true
      }
    }
    return false
  } catch (err) {
    console.error('Ticket auto-lookup history check failed:', err)
    return false
  }
}

export function registerTicketChannelCreate(client: Client): void {
  client.on('channelCreate', (channel) => {
    if (channel.type !== ChannelType.GuildText) return
    if (channel.parentId !== TICKET_CATEGORY_ID) return
    prunePendingTicketChannels()
    pendingTicketChannels.set(channel.id, Date.now())
  })

  client.on('channelDelete', (channel) => {
    pendingTicketChannels.delete(channel.id)
  })

  client.on('messageCreate', async (message) => {
    const registeredAt = pendingTicketChannels.get(message.channelId)
    if (registeredAt === undefined) return
    if (Date.now() - registeredAt > PENDING_TICKET_TTL_MS) {
      pendingTicketChannels.delete(message.channelId)
      return
    }
    if (message.author.id !== TICKET_BOT_USER_ID) return

    pendingTicketChannels.delete(message.channelId)

    const targetDiscordId = message.mentions.users.first()?.id
    if (!targetDiscordId) return

    const channel = message.channel as TextChannel

    // Claim this ticket before doing any work — see the comment block above
    // pendingTicketChannels for why an in-process guard alone isn't enough.
    const lockKey = `ticket:autolookup:${message.channelId}`
    const acquired = await tryAcquireOnce(lockKey, AUTO_LOOKUP_LOCK_TTL_SECONDS)
    if (acquired === false) {
      // Another instance (almost always the sibling container mid-deploy)
      // already claimed this ticket. Don't post a duplicate.
      return
    }
    if (acquired === null) {
      // Redis unavailable — fail open, but check recent history first so we
      // don't blindly double-post if this really is a duplicate delivery.
      if (await hasExistingAutoLookupPost(channel)) return
    }

    let characters: Awaited<ReturnType<typeof fetchCharacters>>
    try {
      characters = await fetchCharacters(targetDiscordId)
    } catch (err) {
      console.error('Ticket lookup API error:', err)
      return
    }

    if (characters.length === 0) {
      const accountMadeRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_account_made:${targetDiscordId}`)
          .setLabel('Account Made')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
      )
      await channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `Hey <@${targetDiscordId}>! It looks like you don't have a character linked to your Discord account.\n\nPlease visit **https://mke.euphoric.gg/account** to create one, then click **Account Made** below so we can verify and help you further.`
              )
            )
            .addActionRowComponents(accountMadeRow)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('-# via Otterbot')
            ),
        ] as any[],
        flags: ((MessageFlags.IsComponentsV2 as number) | SUPPRESS_NOTIFICATIONS),
      } as any)
      return
    }

    const businessId = channel.guildId ? await getMckenzieBusinessId(channel.guildId) : null

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
      await channel.send(
        buildTicketCharacterEmbed(character, targetDiscordId, { sessionKey, lookupMethod: 'discord' }) as any
      )
      return
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`ticket_char_select:${targetDiscordId}`)
      .setPlaceholder('Select your character')
      .addOptions(
        characters.map((c) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(c.name)
            .setDescription(c.csn ? `CSN: ${c.csn}` : 'No CSN on record')
            .setValue(c.id)
        )
      )

    await channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `<@${targetDiscordId}> We found multiple characters linked to your account. Please select yours below.`
            )
          )
          .addSeparatorComponents(
            sepLarge()
          )
          .addActionRowComponents(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
          ),
      ] as any[],
      flags: MessageFlags.IsComponentsV2,
    })
  })
}
