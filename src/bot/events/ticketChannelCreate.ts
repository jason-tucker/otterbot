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
import {
  TICKET_BOT_USER_ID,
  TICKET_CATEGORY_ID,
  fetchCharacters,
  getMckenzieBusinessId,
} from '../../services/ticketLookup'

const pendingTicketChannels = new Set<string>()

export function registerTicketChannelCreate(client: Client): void {
  client.on('channelCreate', (channel) => {
    if (channel.type !== ChannelType.GuildText) return
    if (channel.parentId !== TICKET_CATEGORY_ID) return
    pendingTicketChannels.add(channel.id)
  })

  client.on('messageCreate', async (message) => {
    if (!pendingTicketChannels.has(message.channelId)) return
    if (message.author.id !== TICKET_BOT_USER_ID) return

    pendingTicketChannels.delete(message.channelId)

    const targetDiscordId = message.mentions.users.first()?.id
    if (!targetDiscordId) return

    const channel = message.channel as TextChannel

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
