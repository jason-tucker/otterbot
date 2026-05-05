import { type StringSelectMenuInteraction, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { cmd } from '../../utils/cmdMention'

function sep() { return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true) }

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
        `- **View Notes** — see all notes on record (includes McKenzie API notes)\n` +
        `- **Change Standing** — mark a character as good / neutral / bad / blacklisted`
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
        `- **Change Standing** — set good / neutral / bad / blacklisted on a character\n` +
        `- **Add Note** — attach manager or owner-only notes\n\n` +
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
