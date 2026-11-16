import { ModalSubmitInteraction } from 'discord.js'
import { MckenzieProvider } from '../../services/providers/MckenzieProvider'
import { resolveBusinesses } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { buildBusinessEmbed } from '../../embeds/businessEmbed'
import { audit, auditSafe } from '../../services/auditService'
import { storeBusinessRosterSession } from '../../services/interactionCache'
import { checkBusinessCooldown, hasRosterDetailAccess } from '../../services/rosterAccess'
import { rosterSendAuthorizer } from '../../services/rosterDetailAccess'

export async function handleBusinessSearchSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  // Guild check first — before any roster API call.
  if (!interaction.guild) {
    await interaction.reply({ content: 'This can only be used in a server.', ephemeral: true })
    return
  }
  await interaction.deferReply({ ephemeral: true })

  const searchName = interaction.fields.getTextInputValue('business_name').trim()
  if (!searchName) {
    await interaction.editReply('Please enter a business name.')
    return
  }

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const allResolved = await resolveBusinesses(member)
  const sudo = isSudoUser(member)

  if (allResolved.length === 0 && !sudo) {
    await interaction.editReply('You need to be a staff member of at least one business to use this.')
    await auditSafe({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      action: 'business_search',
      success: false,
      details: { query: searchName, reason: 'not_staff', source: 'lookup_button' },
    })
    return
  }

  // Same cooldown map as /business so the modal cannot bypass it.
  if (!sudo) {
    const wait = checkBusinessCooldown(interaction.user.id)
    if (wait > 0) {
      await interaction.editReply(`⏳ Slow down — try again in ${wait}s.`)
      return
    }
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

  // Least privilege: contact details, Lookup Employee and Send to Channel only
  // for sudo, staff of the searched business and McKenzie staff.
  const full = hasRosterDetailAccess(allResolved, roster.businessName, sudo)
  const sessionKey = full
    ? storeBusinessRosterSession({ actorDiscordId: interaction.user.id, roster })
    : undefined
  const response = buildBusinessEmbed({ name: roster.businessName, providerType: 'mckenzie' }, roster, {
    sessionKey,
    full,
    authorizeSend: full ? rosterSendAuthorizer(interaction.user.id, roster.businessName) : undefined,
  })
  await interaction.editReply({ ...response, content: null } as any)
}
