import type { StringSelectMenuInteraction } from 'discord.js'
import { env } from '../../config/env'
import { buildTicketCharacterEmbed } from '../../embeds/ticketCharacterEmbed'
import { db } from '../../db/client'
import { businesses } from '../../db/schema'
import { and, eq } from 'drizzle-orm'
import { storeLookupSession } from '../../services/interactionCache'
import { resolveBusinesses } from '../../services/permissionService'

/**
 * Who may reveal a customer's MKE PII (CSN / phone / bank) from the ticket
 * character selector. The selector lives on a PUBLIC ticket message, so any
 * member who can see the channel could otherwise pull another user's PII by
 * picking from the menu. Allow only:
 *   - the ticket subject themselves (self-lookup, like /lookup),
 *   - McKenzie staff (same gate as /lookup), or
 *   - ticket support staff (ManageChannels), matching ticket_account_made.
 */
async function canRevealTicketPII(
  interaction: StringSelectMenuInteraction,
  targetDiscordId: string,
): Promise<boolean> {
  if (interaction.user.id === targetDiscordId) return true
  if (!interaction.guild) return false
  const member =
    interaction.guild.members.cache.get(interaction.user.id) ??
    (await interaction.guild.members.fetch(interaction.user.id).catch(() => null))
  if (!member) return false
  if (member.permissions.has('ManageChannels')) return true
  const resolved = await resolveBusinesses(member)
  return resolved.some((r) => r.business.providerType === 'mckenzie')
}

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
    { headers: { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY }, signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return []
  const data = await res.json() as MkCharacterProfile[]
  if (!Array.isArray(data)) return []
  return data.filter((p) => p.status).map((p) => ({
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
    .where(and(eq(businesses.providerType, 'mckenzie'), eq(businesses.guildId, guildId), eq(businesses.active, true)))
    .limit(1)
  return row?.id ?? null
}

export async function handleTicketCharSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const targetDiscordId = interaction.customId.slice('ticket_char_select:'.length)

  // Authorize BEFORE acknowledging so we can deny ephemerally and never expose
  // PII to an unauthorized clicker on this public message.
  if (!(await canRevealTicketPII(interaction, targetDiscordId))) {
    await interaction.reply({
      content: '❌ Only the ticket creator or McKenzie staff can view this character.',
      ephemeral: true,
    })
    return
  }

  await interaction.deferUpdate()

  const selectedCharacterId = interaction.values[0]

  let characters: Awaited<ReturnType<typeof fetchCharacters>>
  try {
    characters = await fetchCharacters(targetDiscordId)
  } catch {
    await interaction.editReply({ content: 'Could not reach the MKE API. Try again in a moment.', components: [] })
    return
  }

  const character = characters.find((c) => c.id === selectedCharacterId)
  if (!character) {
    await interaction.editReply({ content: 'Character not found. Please try again.', components: [] })
    return
  }

  const businessId = interaction.guildId ? await getMckenzieBusinessId(interaction.guildId) : null
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

  await interaction.editReply(
    buildTicketCharacterEmbed(character, targetDiscordId, { sessionKey, lookupMethod: 'discord' }) as any
  )
}
