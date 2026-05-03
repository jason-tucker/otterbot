import { ChannelType, type Client, type TextChannel, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } from 'discord.js'
import { env } from '../../config/env'
import { buildTicketCharacterEmbed } from '../../embeds/ticketCharacterEmbed'

const TICKET_CATEGORY_ID = '1101739267908177991'
const TICKET_BOT_USER_ID = '722196398635745312'

interface MkCharacterProfile {
  id: string
  status: boolean
  name: string
  csn: string
  dob: string | null
  phoneNumber: string
}

async function fetchCharacters(discordId: string) {
  const res = await fetch(
    `${env.EUPHORIC_API_BASE_URL}/character-profiles/discord/${encodeURIComponent(discordId)}`,
    { headers: { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY }, signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return []
  const data = await res.json() as MkCharacterProfile[]
  if (!Array.isArray(data)) return []
  return data.filter((p) => p.status).map((p) => ({
    id: p.id,
    name: p.name,
    csn: p.csn || null,
    dob: p.dob,
    phoneNumber: p.phoneNumber || null,
  }))
}

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
      await channel.send(
        `Hey <@${targetDiscordId}>! It looks like you don't have a character linked to your Discord account. Please visit https://mke.euphoric.gg to assign your character, then let us know and we can help you further.`
      )
      return
    }

    if (characters.length === 1) {
      await channel.send(buildTicketCharacterEmbed(characters[0], targetDiscordId))
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
      content: `<@${targetDiscordId}> We found multiple characters linked to your account. Please select yours below.`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    })
  })
}
