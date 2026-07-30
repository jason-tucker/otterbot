import type { ButtonInteraction } from 'discord.js'
import { ActionRowBuilder, ContainerBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder } from 'discord.js'
import { getBusinessRosterSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { v2Text } from '../../utils/cv2'

export async function handleBusinessLookupButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate()

  const sessionKey = interaction.customId.slice('business_lookup:'.length)
  const session = getBusinessRosterSession(sessionKey)

  if (!session) {
    await interaction.editReply(v2Text(`This session has expired. Run ${cmd('business', interaction.guildId!)} again.`) as any)
    return
  }

  if (session.roster.members.length === 0) {
    await interaction.editReply(v2Text('No roster members found.') as any)
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
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().setAccentColor(0x1a1a2e).addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Who would you like to look up?')
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ] as any[],
  } as any)
}
