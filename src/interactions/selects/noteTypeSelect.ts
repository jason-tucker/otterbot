import {
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import { markerTypeLabel } from '../../services/providers/IBusinessProvider'

export async function handleNoteTypeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const sessionKey = interaction.customId.slice('note_type_select:'.length)
  const session = await getLookupSession(sessionKey)

  if (!session) {
    await interaction.reply({
      content: `This lookup has expired. Run ${cmd('lookup', interaction.guildId!)} again.`,
      ephemeral: true,
    })
    return
  }

  if (!interaction.guild) return
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const business = resolved.find((r) => r.business.id === session.businessId)
  if (!business) {
    await interaction.reply({
      content: 'You must be McKenzie staff to add notes.',
      ephemeral: true,
    })
    return
  }

  const type = Number(interaction.values[0])
  if (!Number.isInteger(type) || type < 0 || type > 2) {
    await interaction.reply({ content: 'Invalid note type.', ephemeral: true })
    return
  }

  const modal = new ModalBuilder()
    .setCustomId(`note_submit:${sessionKey}:${type}`)
    .setTitle(`${markerTypeLabel(type)} — ${session.characterName}`.slice(0, 45))

  const noteInput = new TextInputBuilder()
    .setCustomId('note_content')
    .setLabel(markerTypeLabel(type))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder(`Enter ${markerTypeLabel(type).toLowerCase()}...`)

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput))
  await interaction.showModal(modal)
}
