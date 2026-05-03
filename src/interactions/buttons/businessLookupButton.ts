import type { ButtonInteraction } from 'discord.js'
import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js'
import { getBusinessRosterSession } from '../../services/interactionCache'

export async function handleBusinessLookupButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate()

  const sessionKey = interaction.customId.slice('business_lookup:'.length)
  const session = getBusinessRosterSession(sessionKey)

  if (!session) {
    await interaction.editReply({ content: 'This session has expired. Run `/business` again.', embeds: [], components: [] })
    return
  }

  if (session.roster.members.length === 0) {
    await interaction.editReply({ content: 'No roster members found.', embeds: [], components: [] })
    return
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`business_employee_select:${sessionKey}`)
    .setPlaceholder('Select an employee to look up')
    .setMaxValues(1)
    .addOptions(
      session.roster.members.map((m) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(m.name)
          .setDescription(m.role === 'owner' ? '(Owner)' : m.csn ? `CSN: ${m.csn}` : 'Employee')
          .setValue(m.id)
      )
    )

  await interaction.editReply({
    content: 'Who would you like to look up?',
    embeds: [],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  })
}
