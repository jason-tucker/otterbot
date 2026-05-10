import { ButtonInteraction, EmbedBuilder } from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { db } from '../../db/client'
import { notes } from '../../db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { resolveBusinesses } from '../../services/permissionService'
import { getProvider } from '../../services/businessService'
import {
  VISIBLE_MARKER_TYPES,
  markerTypeLabel,
  markerTypeEmoji,
} from '../../services/providers/IBusinessProvider'
import { safeMarkdown } from '../../utils/escape'

export async function handleNoteViewButton(interaction: ButtonInteraction): Promise<void> {
  const sessionKey = interaction.customId.split(':')[1]
  const session = await getLookupSession(sessionKey)

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
    await interaction.editReply('You must be McKenzie staff to view notes.')
    return
  }

  const rank = business.rank
  const visibilityFilter = rank === 'owner'
    ? ['staff', 'manager', 'owner']
    : rank === 'manager'
      ? ['staff', 'manager']
      : ['staff']

  // Fetch API notes (McKenzie GET) and local bot-added notes in parallel
  const provider = getProvider(business.business)
  const [apiNotes, localRows] = await Promise.all([
    provider.getNotes && session.characterCsn
      ? provider.getNotes(session.characterCsn).catch(() => [])
      : Promise.resolve([]),
    db.select().from(notes)
      .where(and(eq(notes.businessId, session.businessId), eq(notes.characterId, session.characterId)))
      .orderBy(desc(notes.createdAt))
      .limit(10),
  ])

  const localVisible = localRows.filter((n) => visibilityFilter.includes(n.visibility))
  // Only show the 3 user-visible marker types (Note / Good Experience / Bad Experience).
  // Other types (warnings, bans, security flags) come through the same endpoint
  // but are reflected via the standing field, not listed as notes.
  const visibleApi = apiNotes
    .filter((n) => (VISIBLE_MARKER_TYPES as readonly number[]).includes(n.type))
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())

  const hasAny = visibleApi.length > 0 || localVisible.length > 0

  if (!hasAny) {
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
    .setFooter({ text: `${business.business.name}` })
    .setTimestamp()

  // MKE API markers first (newest), labeled with type
  for (const note of visibleApi.slice(0, 8)) {
    const date = new Date(note.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    embed.addFields({
      name: `${markerTypeEmoji(note.type)} ${markerTypeLabel(note.type)} — Employee #${note.employeeId} — ${date}`,
      value: note.content ? safeMarkdown(note.content) : '*(empty)*',
      inline: false,
    })
  }

  // Bot-added notes after
  for (const note of localVisible.slice(0, 5)) {
    const date = note.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const label = note.visibility !== 'staff' ? ` [${note.visibility}]` : ''
    embed.addFields({
      name: `${safeMarkdown(note.authorName)} — ${date}${label}`,
      value: safeMarkdown(note.content),
      inline: false,
    })
  }

  await interaction.editReply({ embeds: [embed] })
}
