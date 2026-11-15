import type { ButtonInteraction } from 'discord.js'
import { ActionRowBuilder, ContainerBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder } from 'discord.js'
import { getBusinessRosterSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { v2Text } from '../../utils/cv2'
import { MAX_SELECT_OPTIONS, clip100 } from '../../services/rosterAccess'
import { canSeeRosterDetails } from '../../services/rosterDetailAccess'

export async function handleBusinessLookupButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate()

  const sessionKey = interaction.customId.slice('business_lookup:'.length)
  const session = getBusinessRosterSession(sessionKey)

  if (!session) {
    await interaction.editReply(v2Text(`This session has expired. Run ${cmd('business', interaction.guildId!)} again.`) as any)
    return
  }

  if (session.actorDiscordId !== interaction.user.id) {
    await interaction.followUp({ content: 'This roster belongs to another user. Run the search yourself.', ephemeral: true })
    return
  }

  // Re-validate on click: the select below shows CSNs, so the clicker must
  // still have roster detail access (sudo, staff of this business, McKenzie staff).
  if (!interaction.guild || !(await canSeeRosterDetails(interaction.guild, interaction.user.id, session.roster.businessName))) {
    await interaction.editReply(v2Text('You do not have access to look up employees of this business.') as any)
    return
  }

  if (session.roster.members.length === 0) {
    await interaction.editReply(v2Text('No roster members found.') as any)
    return
  }

  // Discord caps a select at 25 options; unbounded rosters made the whole reply fail.
  const total = session.roster.members.length
  const shown = session.roster.members.slice(0, MAX_SELECT_OPTIONS)

  const select = new StringSelectMenuBuilder()
    .setCustomId(`business_employee_select:${sessionKey}`)
    .setPlaceholder('Select an employee to look up')
    .setMaxValues(1)
    .addOptions(
      shown.map((m) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(clip100(m.name) || '(unnamed)')
          .setDescription(clip100(m.role === 'owner' ? '(Owner)' : m.csn ? `CSN: ${m.csn}` : 'Employee'))
          .setValue(m.id)
      )
    )

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().setAccentColor(0x1a1a2e).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          total > shown.length
            ? `Who would you like to look up?
Showing the first ${shown.length} of ${total} members.`
            : 'Who would you like to look up?',
        )
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ] as any[],
  } as any)
}
