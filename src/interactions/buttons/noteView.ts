import { ButtonInteraction, EmbedBuilder } from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { db } from '../../db/client'
import { notes } from '../../db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { resolveBusinesses } from '../../services/permissionService'

export async function handleNoteViewButton(interaction: ButtonInteraction): Promise<void> {
  const sessionKey = interaction.customId.split(':')[1]
  const session = getLookupSession(sessionKey)

  if (!session) {
    await interaction.reply({ content: `This lookup has expired. Run ${cmd('lookup', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  if (!interaction.guild) return
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const business = resolved.find((r) => r.business.id === session.businessId)

  if (!business) {
    await interaction.editReply('You no longer have access to that business.')
    return
  }

  const rank = business.rank
  const visibilityFilter = rank === 'owner'
    ? ['staff', 'manager', 'owner']
    : rank === 'manager'
      ? ['staff', 'manager']
      : ['staff']

  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.businessId, session.businessId), eq(notes.characterId, session.characterId)))
    .orderBy(desc(notes.createdAt))
    .limit(10)

  const visible = rows.filter((n) => visibilityFilter.includes(n.visibility))

  if (visible.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setDescription(`No notes on record for **${session.characterName}**.`),
      ],
    })
    return
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Notes — ${session.characterName}`)
    .setFooter({ text: `Showing up to 10 most recent • ${business.business.name}` })
    .setTimestamp()

  for (const note of visible) {
    const date = note.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const label = note.visibility !== 'staff' ? ` [${note.visibility}]` : ''
    embed.addFields({
      name: `${note.authorName} — ${date}${label}`,
      value: note.content,
      inline: false,
    })
  }

  await interaction.editReply({ embeds: [embed] })
}
