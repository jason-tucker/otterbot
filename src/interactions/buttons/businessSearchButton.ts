import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { auditSafe } from '../../services/auditService'

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

  // Re-validate on click: staff who lost their role since /lookup must not search rosters.
  if (!interaction.guild) {
    await interaction.reply({ content: 'This can only be used in a server.', ephemeral: true })
    return
  }
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const allResolved = await resolveBusinesses(member)
  if (allResolved.length === 0 && !isSudoUser(member)) {
    await interaction.reply({
      content: 'You need to be a staff member of at least one business to use this.',
      ephemeral: true,
    })
    await auditSafe({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      action: 'business_search',
      success: false,
      details: { reason: 'not_staff', source: 'lookup_button' },
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
