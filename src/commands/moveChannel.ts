import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  CategoryChannel,
  GuildChannel,
  PermissionFlagsBits,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'

export const data = new SlashCommandBuilder()
  .setName('movechannel')
  .setDescription('Move a channel to a different category')
  .addChannelOption((opt) =>
    opt
      .setName('channel')
      .setDescription('The channel to move')
      .setRequired(true)
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildVoice,
        ChannelType.GuildForum,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildStageVoice
      )
  )
  .addChannelOption((opt) =>
    opt
      .setName('category')
      .setDescription('The target category')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildCategory)
  )
  .addStringOption((opt) =>
    opt
      .setName('position')
      .setDescription('Where to place the channel in the category')
      .setRequired(true)
      .addChoices({ name: 'Top', value: 'top' }, { name: 'Bottom', value: 'bottom' })
  )
  .setDMPermission(false)
  .setDefaultMemberPermissions(0)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)

  if (resolved.length === 0 && !isSudoUser(member)) {
    await interaction.editReply('You do not have permission to use this command.')
    return
  }

  const targetChannel = interaction.options.getChannel('channel', true) as GuildChannel
  const targetCategory = interaction.options.getChannel('category', true) as CategoryChannel
  const placement = interaction.options.getString('position', true) as 'top' | 'bottom'

  const botMember = await interaction.guild.members.fetchMe()
  if (!targetChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply("I don't have permission to manage that channel.")
    return
  }

  const previousCategoryName = targetChannel.parent?.name ?? 'no category'

  // Move to the new category (places at bottom by default)
  await targetChannel.setParent(targetCategory.id, { lockPermissions: false })

  if (placement === 'top') {
    // Get siblings (excluding the channel we just moved) sorted by position
    const siblings = targetCategory.children.cache
      .filter((c) => c.id !== targetChannel.id)
      .sort((a, b) => a.rawPosition - b.rawPosition)

    if (siblings.size > 0) {
      // Set our channel to just before the current first sibling
      await targetChannel.setPosition(siblings.first()!.rawPosition)
    }
  }

  await interaction.editReply(
    `Moved **#${targetChannel.name}** from **${previousCategoryName}** → **${targetCategory.name}** (${placement}).`
  )
}
