import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isPortalAdmin } from '../services/permissionService'
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
  const admin = isPortalAdmin(member)

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Otterbot — Available Commands')
    .setFooter({ text: 'via Otterbot' })
    .setTimestamp()

  if (resolved.length === 0 && !admin) {
    embed.setDescription('You do not have any business staff roles assigned.\nContact a manager or owner to get access.')
    await interaction.editReply({ embeds: [embed] })
    return
  }

  const lines: string[] = []

  // Commands available to all staff regardless of rank
  if (resolved.length > 0) {
    lines.push('**Customer Lookup**')
    lines.push('`/lookup user:<@user>` — Look up a Discord user\'s RP characters, standing, and notes')
    lines.push('Right-click a user → **Look Up** — Shortcut for /lookup')
    lines.push('')
    lines.push('**Business**')
    lines.push('`/business name:<name>` — View a business roster; staff of that business can look up any employee directly')
    lines.push('')
    lines.push('**Reference**')
    lines.push('`/artsize` — Art commission size reference')
    lines.push('`/tcsheet` — TC sheet reference')
    lines.push('`/printinfo` — McKenzie printing information')
    lines.push('`/caked` — Caked Up order and event information')
  }

  // Manager+ commands
  const isManagerPlus = resolved.some((r) => r.rank === 'manager' || r.rank === 'owner')
  if (isManagerPlus) {
    lines.push('')
    lines.push('**Manager Actions** *(on customer embed)*')
    lines.push('⚖️ Change Standing — Set a customer\'s standing (good / neutral / bad / blacklisted)')
    lines.push('`/movechannel` — Move the current ticket channel to a different category')
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
    lines.push('**Portal Admin**')
    lines.push('You have portal admin access across all businesses.')
  }

  embed.setDescription(lines.join('\n'))
  await interaction.editReply({ embeds: [embed] })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
