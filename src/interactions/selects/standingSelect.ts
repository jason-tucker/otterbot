import { StringSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'

export async function handleStandingSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const sessionKey = interaction.customId.split(':')[1]
  const session = getLookupSession(sessionKey)

  if (!session) {
    await interaction.reply({ content: `This lookup has expired. Run ${cmd('lookup', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  const selectedStanding = interaction.values[0]

  const modal = new ModalBuilder()
    .setCustomId(`standing_submit:${sessionKey}:${selectedStanding}`)
    .setTitle('Change Standing')

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel(`Reason for changing to ${selectedStanding} (optional)`)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200)
    .setPlaceholder('Leave blank for no reason')

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput))
  await interaction.showModal(modal)
}
