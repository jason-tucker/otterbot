import { type StringSelectMenuInteraction, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { cmd } from '../../utils/cmdMention'
import { sep } from '../../utils/cv2'

export async function handleHelpSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) return
  await interaction.deferUpdate()

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const section = interaction.values[0]
  const guildId = interaction.guildId!
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('help:back').setLabel('Back to overview').setStyle(ButtonStyle.Secondary)
  )

  if (section === 'public') {
    const c = new ContainerBuilder().setAccentColor(0x5865f2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🌐 Public Commands'))
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${cmd('oc', guildId)} — Original Clothing current stock with product links. Tap any item to open its page.\n\n` +
        `${cmd('caked', guildId)} — Caked Up order info, pricing, and intake forms.\n\n` +
        `${cmd('printinfo', guildId)} — McKenzie Enterprises printing reference and pricing.\n\n` +
        `${cmd('artsize', guildId)} — Art commission size guide.\n\n` +
        `${cmd('tcsheet', guildId)} — Trading card sheet reference.\n\n` +
        `${cmd('help', guildId)} — This menu.`
      ))
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [c, backRow] } as any)

  } else if (section === 'staff') {
    const c = new ContainerBuilder().setAccentColor(0x3498db)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👔 Staff Commands'))
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${cmd('lookup', guildId)} — Look up a Discord user's characters, standing, and notes.\n` +
        `Right-click a user → Apps → **Lookup** for a shortcut.\n\n` +
        `${cmd('business', guildId)} — Search any business roster by name. Staff of that business can look up employees directly.\n\n` +
        `**From any lookup result:**\n` +
        `- **Add Note** — attach an internal note to a character\n` +
        `- **View Notes** — see all notes on record (includes McKenzie API notes — Note / Good Experience / Bad Experience)\n` +
        `- **Standing** — automatically derived from the most recent MKE Good/Bad Experience marker\n\n` +
        `_For the automatic ticket-channel lookup, see the **🎫 Auto-Ticket Helper** section in the menu._`
      ))
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [c, backRow] } as any)

  } else if (section === 'auto_ticket') {
    const c = new ContainerBuilder().setAccentColor(0x9b59b6)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🎫 Auto-Ticket Helper'))
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `When Ticket Tool opens a ticket channel and pings a user, otterbot automatically runs the MKE character lookup so staff don't have to.\n\n` +
        `**Lookup outcomes:**\n` +
        `- **1 character found** → posts the character embed in the ticket with the usual **Add Note** / **View Notes** buttons.\n` +
        `- **2+ characters** → posts a select menu so the user picks the right one; on selection the embed is rendered.\n` +
        `- **0 characters** → posts a silent message with an **Account Made** button.\n\n` +
        `**Account Made flow (no-character users):**\n` +
        `1. User goes to the website and signs up.\n` +
        `2. Clicks **Account Made** in the ticket — re-runs the MKE lookup (rate-limited to once per 4 min per user).\n` +
        `3. If a character is now linked, the original message is replaced with the character embed/selector.\n` +
        `4. If still no character, the user gets an ephemeral with three options:\n` +
        `   - 🌐 **Website** — link to the MKE account-creation page.\n` +
        `   - 🆘 **Ask for Help** — silent ping in the ticket to the Printing Press Operator role.\n` +
        `   - 🔁 **Retry** — manual re-run, same 4-min rate limit.\n\n` +
        `Restricted to the ticket creator unless the clicker has \`ManageChannels\`.`
      ))
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [c, backRow] } as any)

  } else if (section === 'manager') {
    const resolved = await resolveBusinesses(member)
    const isManagerPlus = resolved.some(r => r.rank === 'manager' || r.rank === 'owner')
    if (!isManagerPlus) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [
        new ContainerBuilder().setAccentColor(0xed4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ You need manager or owner rank to view this section.')),
        backRow,
      ] } as any)
      return
    }
    const c = new ContainerBuilder().setAccentColor(0xe67e22)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⚙️ Manager Commands'))
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${cmd('employee', guildId)} — Hire, fire, promote, and demote employees. Supports custom roles.\n` +
        `Right-click a user → Apps → **Manage Employee** for a shortcut.\n\n` +
        `${cmd('movechannel', guildId)} — Move the current ticket channel to a different category.\n\n` +
        `**On any lookup result:**\n` +
        `- **Add Note** — attach manager or owner-only notes\n` +
        `- **Standing** is read-only and derived from the customer's most recent MKE Good/Bad Experience marker.\n\n` +
        `**OC Managers only:**\n` +
        `- ${cmd('oc', guildId)} → **Manage Stock** — update item statuses and product links`
      ))
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [c, backRow] } as any)

  } else if (section === 'admin') {
    if (!isSudoUser(member)) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [
        new ContainerBuilder().setAccentColor(0xed4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Admin access required.')),
        backRow,
      ] } as any)
      return
    }
    const c = new ContainerBuilder().setAccentColor(0xed4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Admin Commands'))
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${cmd('portal', guildId)} — Manage businesses: create, edit, deactivate. Set role mappings and designated owners.\n\n` +
        `**On any employee embed:**\n` +
        `- **Make Owner / Revoke Owner** — grant or remove DB-authoritative ownership\n\n` +
        `Right-click a user → Apps → **Manage Employee** — available to all managers and admins.`
      ))
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [c, backRow] } as any)

  } else if (section === 'access') {
    const resolved = await resolveBusinesses(member)
    const lines = resolved.length > 0
      ? resolved.map(r => `- **${r.business.name}** — ${r.rank.charAt(0).toUpperCase() + r.rank.slice(1)}`)
      : ['_No business access on record._']
    const c = new ContainerBuilder().setAccentColor(0x5865f2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔑 Your Access'))
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [c, backRow] } as any)
  }
}
