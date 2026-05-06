import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'

export async function handleBusinessSearchButton(interaction: ButtonInteraction): Promise<void> {
  const sessionKey = interaction.customId.slice('business_search:'.length)
  const session = await getLookupSession(sessionKey)

  if (!session) {
    await interaction.reply({
      content: `This lookup has expired. Run ${cmd('lookup', interaction.guildId!)} again.`,
      ephemeral: true,
    })
    return
  }

  const modal = new ModalBuilder()
    .setCustomId(`business_search_submit:${sessionKey}`)
    .setTitle('Search Business')

  const input = new TextInputBuilder()
    .setCustomId('business_name')
    .setLabel('Business name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('e.g. McKenzie Enterprises')

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))
  await interaction.showModal(modal)
}
