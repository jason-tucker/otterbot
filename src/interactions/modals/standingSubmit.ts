import { ModalSubmitInteraction, EmbedBuilder } from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses, hasMinRank } from '../../services/permissionService'
import { db } from '../../db/client'
import { standings } from '../../db/schema'
import { and, eq } from 'drizzle-orm'
import { audit } from '../../services/auditService'
import type { Standing } from '../../types/domain'
import { STANDING_COLORS } from '../../types/domain'

const VALID_STANDINGS: Standing[] = ['good', 'neutral', 'bad', 'blacklisted']

export async function handleStandingSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(':')
  const sessionKey = parts[1]
  const newStanding = parts[2] as Standing
  const session = getLookupSession(sessionKey)

  if (!session || !VALID_STANDINGS.includes(newStanding)) {
    await interaction.reply({ content: `This lookup has expired. Run ${cmd('lookup', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  if (!interaction.guild) return
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const business = resolved.find((r) => r.business.id === session.businessId)

  if (!business || !hasMinRank(business.rank, 'manager')) {
    await interaction.editReply('You do not have permission to change standing.')
    return
  }

  const reason = interaction.fields.getTextInputValue('reason').trim() || null

  // Upsert — insert or update if already exists
  const existing = await db
    .select({ id: standings.id })
    .from(standings)
    .where(and(eq(standings.businessId, session.businessId), eq(standings.characterId, session.characterId)))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(standings)
      .set({ standing: newStanding, reason, updatedByDiscordId: interaction.user.id, updatedAt: new Date() })
      .where(eq(standings.id, existing[0].id))
  } else {
    await db.insert(standings).values({
      businessId: session.businessId,
      characterId: session.characterId,
      characterName: session.characterName,
      standing: newStanding,
      reason,
      updatedByDiscordId: interaction.user.id,
    })
  }

  await audit({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    businessId: session.businessId,
    action: 'standing_change',
    targetType: 'character',
    targetId: session.characterId,
    success: true,
    details: { characterName: session.characterName, newStanding, reason },
  })

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(STANDING_COLORS[newStanding])
        .setDescription(`✅ Standing for **${session.characterName}** updated to **${newStanding}**.${reason ? `\nReason: ${reason}` : ''}`),
    ],
  })
}
