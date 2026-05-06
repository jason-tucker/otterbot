import { ModalSubmitInteraction } from 'discord.js'
import { MckenzieProvider } from '../../services/providers/MckenzieProvider'
import { resolveBusinesses } from '../../services/permissionService'
import { buildBusinessEmbed } from '../../embeds/businessEmbed'
import { audit } from '../../services/auditService'
import { storeBusinessRosterSession } from '../../services/interactionCache'

export async function handleBusinessSearchSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true })

  const searchName = interaction.fields.getTextInputValue('business_name').trim()
  if (!searchName) {
    await interaction.editReply('Please enter a business name.')
    return
  }

  const roster = await MckenzieProvider.findByName(searchName)

  await audit({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    action: 'business_search',
    success: roster !== null,
    details: { query: searchName, source: 'lookup_button' },
  })

  if (!roster) {
    await interaction.editReply({ content: `No business found with the name **${searchName}**.` })
    return
  }

  if (!interaction.guild) return
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const allResolved = await resolveBusinesses(member)
  const rosterName = roster.businessName.trim().toLowerCase()
  const resolved = allResolved.find((r) => {
    const apiName = ((r.business.settings?.apiBusinessName as string | undefined) ?? r.business.name).trim().toLowerCase()
    return apiName === rosterName || r.business.name.trim().toLowerCase() === rosterName
  }) ?? allResolved[0] ?? null

  const sessionKey = storeBusinessRosterSession({ resolved, roster })
  const response = buildBusinessEmbed({ name: roster.businessName, providerType: 'mckenzie' }, roster, sessionKey)
  await interaction.editReply({ ...response, content: null } as any)
}
