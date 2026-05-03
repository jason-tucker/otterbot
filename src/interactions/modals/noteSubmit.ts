import { ModalSubmitInteraction, EmbedBuilder } from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import { db } from '../../db/client'
import { notes } from '../../db/schema'
import { audit } from '../../services/auditService'

export async function handleNoteSubmit(interaction: ModalSubmitInteraction): Promise<void> {
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

  const content = interaction.fields.getTextInputValue('note_content').trim()
  if (!content) {
    await interaction.editReply('Note cannot be empty.')
    return
  }

  await db.insert(notes).values({
    businessId: session.businessId,
    characterId: session.characterId,
    characterName: session.characterName,
    content,
    authorDiscordId: interaction.user.id,
    authorName: interaction.user.username,
    visibility: 'staff',
  })

  await audit({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    businessId: session.businessId,
    action: 'note_add',
    targetType: 'character',
    targetId: session.characterId,
    success: true,
    details: { characterName: session.characterName },
  })

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(`✅ Note added for **${session.characterName}**.`),
    ],
  })
}
