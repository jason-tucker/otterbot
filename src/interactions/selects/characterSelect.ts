import { ContainerBuilder, TextDisplayBuilder, MessageFlags, type StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { getProvider } from '../../services/businessService'
import { showCharacterEmbed } from '../../commands/lookup'
import { db } from '../../db/client'
import { businesses } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Business, ResolvedBusiness } from '../../types/domain'
import type { ViewerMode } from '../../embeds/customerEmbed'

function v2Error(msg: string) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().setAccentColor(0x95a5a6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(msg)
      ),
    ] as any[],
  }
}

async function loadBusinessById(id: string): Promise<Business | null> {
  const [row] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    providerType: row.providerType,
    guildId: row.guildId,
    active: row.active,
    settings: row.settings ?? null,
    createdAt: row.createdAt,
  }
}

export async function handleCharacterSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return

  await interaction.deferUpdate()

  const parts = interaction.customId.split(':')
  const businessId = parts[1]
  const targetDiscordId = parts[2]

  if (!businessId || !targetDiscordId) {
    await interaction.editReply(v2Error('Invalid interaction data.') as any)
    return
  }

  const selectedCharacterId = interaction.values[0]
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const staffMatch = resolved.find((r) => r.business.id === businessId)

  let chosen: ResolvedBusiness
  let viewerMode: ViewerMode
  if (staffMatch) {
    chosen = staffMatch
    viewerMode = 'staff'
  } else if (targetDiscordId === interaction.user.id) {
    const business = await loadBusinessById(businessId)
    if (!business || business.providerType !== 'mckenzie' || !business.active) {
      await interaction.editReply(v2Error('You no longer have access to that business.') as any)
      return
    }
    chosen = { business, rank: 'employee' }
    viewerMode = 'self'
  } else {
    await interaction.editReply(v2Error('You no longer have access to that business.') as any)
    return
  }

  const provider = getProvider(chosen.business)
  let characters
  try {
    characters = await provider.lookupByDiscordId(targetDiscordId)
  } catch {
    await interaction.editReply(v2Error('Could not reach the API. Try again in a moment.') as any)
    return
  }

  const character = characters.find((c) => c.id === selectedCharacterId)
  if (!character) {
    await interaction.editReply(v2Error('Character no longer found. Try running /lookup again.') as any)
    return
  }

  await showCharacterEmbed(interaction, chosen, character, targetDiscordId, viewerMode)
}
