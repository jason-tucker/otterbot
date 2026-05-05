import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'

export async function handleNoteAddButton(interaction: ButtonInteraction): Promise<void> {
  const sessionKey = interaction.customId.split(':')[1]
  const session = await getLookupSession(sessionKey)

  if (!session) {
    await interaction.reply({
      content: `This lookup has expired. Run ${cmd('lookup', interaction.guildId!)} again.`,
      ephemeral: true,
    })
    return
  }

  const modal = new ModalBuilder()
    .setCustomId(`note_submit:${sessionKey}`)
    .setTitle(`Add Note — ${session.characterName}`)

  const noteInput = new TextInputBuilder()
    .setCustomId('note_content')
    .setLabel('Note')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('Enter note...')

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput))
  await interaction.showModal(modal)
}
