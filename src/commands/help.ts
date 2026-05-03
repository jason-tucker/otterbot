import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { cmd } from '../utils/cmdMention'
import type { ResolvedBusiness } from '../types/domain'

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show available commands based on your role')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const admin = isSudoUser(member)

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Otterbot — Available Commands')
    .setFooter({ text: 'via Otterbot' })
    .setTimestamp()

  const lines: string[] = []

  const guildId = interaction.guildId!

  // Public commands — available to everyone
  lines.push('**Reference**')
  lines.push(`${cmd('artsize', guildId)} — Art commission size reference`)
  lines.push(`${cmd('tcsheet', guildId)} — TC sheet reference`)
  lines.push(`${cmd('printinfo', guildId)} — McKenzie printing information`)
  lines.push(`${cmd('caked', guildId)} — Caked Up order and event information`)

  // Staff-only commands
  if (resolved.length > 0) {
    lines.push('')
    lines.push('**Customer Lookup**')
    lines.push(`${cmd('lookup', guildId)} — Look up a Discord user's RP characters, standing, and notes`)
    lines.push('Right-click a user → Apps → **Lookup** — Shortcut')
    lines.push('')
    lines.push('**Business**')
    lines.push(`${cmd('business', guildId)} — View a business roster; staff of that business can look up any employee directly`)
  }

  // Manager+ commands
  const isManagerPlus = resolved.some((r) => r.rank === 'manager' || r.rank === 'owner')
  if (isManagerPlus) {
    lines.push('')
    lines.push('**Manager Actions** *(on customer embed)*')
    lines.push('⚖️ Change Standing — Set a customer\'s standing (good / neutral / bad / blacklisted)')
    lines.push(`${cmd('movechannel', guildId)} — Move the current ticket channel to a different category`)
  }

  // Per-business breakdown
  if (resolved.length > 0) {
    lines.push('')
    lines.push('**Your Business Access**')
    for (const r of resolved) {
      lines.push(`• **${r.business.name}** — ${capitalize(r.rank)}`)
    }
  }

  if (admin) {
    lines.push('')
    lines.push('**Sudo Admin**')
    lines.push(`${cmd('portal', guildId)} — Manage businesses, role mappings, and owners`)
    lines.push(`${cmd('employee', guildId)} — Manage employee roles for any business`)
  }

  embed.setDescription(lines.join('\n'))
  await interaction.editReply({ embeds: [embed] })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
