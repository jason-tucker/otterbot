import {
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses } from '../../services/permissionService'
import {
  MARKER_TYPE_NOTE,
  MARKER_TYPE_GOOD,
  MARKER_TYPE_BAD,
} from '../../services/providers/IBusinessProvider'

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

  const select = new StringSelectMenuBuilder()
    .setCustomId(`note_type_select:${sessionKey}`)
    .setPlaceholder('Choose a note type')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Note')
        .setDescription('Neutral observation')
        .setEmoji('📝')
        .setValue(String(MARKER_TYPE_NOTE)),
      new StringSelectMenuOptionBuilder()
        .setLabel('Good Experience')
        .setDescription('Positive marker')
        .setEmoji('✅')
        .setValue(String(MARKER_TYPE_GOOD)),
      new StringSelectMenuOptionBuilder()
        .setLabel('Bad Experience')
        .setDescription('Negative marker')
        .setEmoji('❌')
        .setValue(String(MARKER_TYPE_BAD)),
    )

  await interaction.reply({
    content: `Adding a note for **${session.characterName}** — pick a type:`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  })
}
