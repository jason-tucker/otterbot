import {
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from 'discord.js'
import { getLookupSession } from '../../services/interactionCache'
import { resolveBusinesses } from '../../services/permissionService'
import { hasMinRank } from '../../services/permissionService'

export async function handleStandingChangeButton(interaction: ButtonInteraction): Promise<void> {
  const sessionKey = interaction.customId.split(':')[1]
  const session = getLookupSession(sessionKey)

  if (!session) {
    await interaction.reply({ content: 'This lookup has expired. Run `/lookup` again.', ephemeral: true })
    return
  }

  if (!interaction.guild) return
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const business = resolved.find((r) => r.business.id === session.businessId)

  if (!business || !hasMinRank(business.rank, 'manager')) {
    await interaction.reply({ content: 'You do not have permission to change standing.', ephemeral: true })
    return
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`standing_select:${sessionKey}`)
    .setPlaceholder('Select new standing')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Good').setValue('good').setEmoji('🟢'),
      new StringSelectMenuOptionBuilder().setLabel('Neutral').setValue('neutral').setEmoji('⚪'),
      new StringSelectMenuOptionBuilder().setLabel('Bad').setValue('bad').setEmoji('🟠'),
      new StringSelectMenuOptionBuilder().setLabel('Blacklisted').setValue('blacklisted').setEmoji('🔴'),
    )

  await interaction.reply({
    content: `Select new standing for **${session.characterName}**:`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  })
}
