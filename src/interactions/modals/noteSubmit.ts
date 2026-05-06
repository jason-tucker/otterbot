import { ModalSubmitInteraction, EmbedBuilder } from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import { db } from '../../db/client'
import { notes } from '../../db/schema'
import { audit } from '../../services/auditService'
import { getProvider } from '../../services/businessService'
import { markerTypeLabel } from '../../services/providers/IBusinessProvider'

export async function handleNoteSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(':')
  const sessionKey = parts[1]
  const type = parts[2] !== undefined ? Number(parts[2]) : 0
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
    await interaction.editReply('You must be McKenzie staff to add notes.')
    return
  }

  const content = interaction.fields.getTextInputValue('note_content').trim()
  if (!content) {
    await interaction.editReply('Note cannot be empty.')
    return
  }

  const provider = getProvider(business.business)
  const typeLabel = markerTypeLabel(type)

  let apiOk = false
  let apiError: string | undefined
  if (provider.createMarker && session.characterCsn) {
    const result = await provider.createMarker(session.characterCsn, type, content, interaction.user.id)
    apiOk = result.ok
    apiError = result.error
    if (!result.ok) {
      console.warn(`[MKE] createMarker failed status=${result.status ?? 'n/a'} error=${result.error?.slice(0, 200)}`)
    }
  }

  // Always save to local DB so the note isn't lost if the MKE POST is rejected.
  await db.insert(notes).values({
    businessId: session.businessId,
    characterId: session.characterId,
    characterName: session.characterName,
    content: apiOk ? content : `[${typeLabel}] ${content}`,
    authorDiscordId: interaction.user.id,
    authorName: interaction.user.username,
    visibility: 'staff',
  })

  await audit({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    businessId: session.businessId,
    action: apiOk ? 'note_add_mke' : 'note_add',
    targetType: 'character',
    targetId: session.characterId,
    success: true,
    details: { characterName: session.characterName, type, mkePosted: apiOk, mkeError: apiError },
  })

  if (apiOk) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ ${typeLabel} added for **${session.characterName}** (synced to MKE).`),
      ],
    })
  } else {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfaa61a)
          .setTitle('Note saved locally')
          .setDescription(
            `${typeLabel} added for **${session.characterName}**, but the MKE API rejected the create call.\n` +
            `It's been kept in the bot's local notes so nothing is lost.\n\n` +
            `Tucker — MKE returned: \`${apiError?.slice(0, 200) ?? 'unknown error'}\``,
          ),
      ],
    })
  }
}
