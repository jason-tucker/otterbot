import { type StringSelectMenuInteraction } from 'discord.js'
import { getButton } from '../../services/businessButtonsService'
import { buildButtonEditPanel } from '../../embeds/businessButtons'
import { requireButtonManager } from '../buttons/businessButtonsButton'

const NO_PERMISSION = 'You need to be a manager of this business to manage its buttons.'

export async function handleBusinessButtonSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  await interaction.deferUpdate()

  const businessId = interaction.customId.split(':')[1]
  if (!(await requireButtonManager(interaction, businessId))) {
    await interaction.followUp({ content: NO_PERMISSION, ephemeral: true })
    return
  }

  const button = await getButton(interaction.values[0])
  if (!button || button.businessId !== businessId) {
    await interaction.followUp({ content: 'That button no longer exists. Use Back to refresh.', ephemeral: true })
    return
  }

  await interaction.editReply({ ...buildButtonEditPanel(button), content: null } as never)
}
