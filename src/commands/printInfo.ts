/**
 * /printinfo — McKenzie Enterprises printing information.
 *
 * USE THIS FILE AS A REFERENCE when building new commands.
 * Every Discord markdown feature and embed option used here is documented inline.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  DISCORD MARKDOWN — works in embed descriptions, field values, and content
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  TEXT STYLE
 *    **bold**                 → bold
 *    *italic* or _italic_     → italic
 *    __underline__            → underline
 *    ~~strikethrough~~        → strikethrough
 *    ||spoiler||              → hidden until clicked
 *    `inline code`            → monospace inline
 *    ```code block```         → monospace block (add language for syntax highlight)
 *
 *  STRUCTURE
 *    # H1  ## H2  ### H3      → headers (message content only, NOT inside embeds)
 *    - item  or  * item       → bullet list
 *    1. item                  → numbered list (Discord auto-increments)
 *    > text                   → blockquote — indented callout, great for pricing tiers
 *    -# text                  → subtext — renders smaller and muted below a paragraph
 *
 *  LINKS & MENTIONS (work in embeds and DMs, NOT in plain channel messages)
 *    [label](https://url)     → clickable hyperlink
 *    <@USER_ID>               → user mention
 *    <@&ROLE_ID>              → role mention
 *    <#CHANNEL_ID>            → channel mention
 *
 *  TIMESTAMPS (auto-localise to the viewer's timezone)
 *    <t:UNIX>                 → "May 2, 2026 9:00 PM"
 *    <t:UNIX:R>               → "3 hours ago" (relative)
 *    <t:UNIX:D>               → "May 2, 2026" (long date)
 *    <t:UNIX:T>               → "9:00 PM" (time only)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  EMBED BUILDER OPTIONS
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  .setColor(0xRRGGBB)        → left border stripe color — strip the # from hex
 *  .setTitle('text')          → bold title (no markdown processed)
 *  .setURL('https://...')     → makes the title a clickable link
 *  .setDescription('text')    → main body — full markdown supported
 *  .addFields([...])          → named sections; { inline: true } fits 2–3 per row
 *  .setImage('url')           → large image displayed below all fields
 *  .setThumbnail('url')       → small image in the top-right corner
 *  .setFooter({ text })       → small muted text at the very bottom
 *  .setTimestamp()            → appends current time to the footer
 *  .setAuthor({ name, iconURL, url }) → small row above the title
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  ACTION ROWS & BUTTONS
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  - Max 5 ActionRows per message
 *  - Each row: up to 5 buttons  OR  1 select menu (not both)
 *  - Button styles:
 *      ButtonStyle.Primary   → blue   (main action)
 *      ButtonStyle.Secondary → grey   (secondary / nav)
 *      ButtonStyle.Success   → green  (confirm)
 *      ButtonStyle.Danger    → red    (destructive)
 *      ButtonStyle.Link      → grey + arrow, opens a URL (no interaction handler needed)
 *  - Buttons can have .setEmoji('🖨️') — use either a Unicode emoji or a Discord emoji ID
 *  - .setDisabled(true) greys out a button without removing it
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  SELECT MENUS
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  StringSelectMenuBuilder  → dropdown of text options (up to 25)
 *  .setMinValues(1)         → minimum selections required
 *  .setMaxValues(3)         → allow multi-select (up to 25)
 *  .addOptions([{ label, value, description, emoji, default }])
 *
 *  ChannelSelectMenuBuilder  → Discord channel picker
 *  UserSelectMenuBuilder     → Discord user picker
 *  RoleSelectMenuBuilder     → Discord role picker
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'

// Strip the # from a hex color — 0x prefix tells JS it's hexadecimal
const BRAND_COLOR = 0x588c7e

export const data = new SlashCommandBuilder()
  .setName('printinfo')
  .setDescription('McKenzie Enterprises printing information and pricing')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // ── MAIN EMBED ─────────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('McKenzie Enterprises — Printing')
    // Joining an array of lines with \n is cleaner than one giant string.
    // Each element maps to a line in the final output.
    .setDescription(
      [
        // [hyperlinks](url) work in embed descriptions and field values
        'All printables at McKenzie Enterprises need to be uploaded to your own [PostImages](https://postimages.org/) Account.',
        'This helps ensure prints do not get deleted by our staff, or by PostImages if posted anonymously.',
        '',
        'To help keep printing costs down, we offer bulk printing discounts:',
        // > blockquote — indents the line; each line needs its own >
        '> **$200** for 1 Print',
        '> **$2,500** for 25 Prints',
        '> **$5,000** for 50 Prints',
        '> **$10,000** for 100 Prints',
        // -# subtext — smaller muted line, good for footnotes and disclaimers
        '-# USB Sticks are no longer for sale.',
      ].join('\n')
    )
    // setFooter adds small muted text at the bottom of the embed
    .setFooter({ text: 'Click a button below for category-specific details.' })

  // ── BUTTONS ────────────────────────────────────────────────────────────────
  // ActionRowBuilder<T> needs a generic so TypeScript knows what goes in the row
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('print_info:business_cards')  // routed in interactionCreate.ts
      .setLabel('Business Cards')
      .setEmoji('🖼️')                             // optional emoji left of label
      .setStyle(ButtonStyle.Primary),             // blue — main action style

    new ButtonBuilder()
      .setCustomId('print_info:trading_cards')
      .setLabel('Trading Cards')
      .setEmoji('🃏')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('print_info:other_printables')
      .setLabel('Other Printables')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Primary),
  )

  // No ephemeral — this message is meant to be visible in the channel.
  // Anyone in the channel can then click the buttons.
  await interaction.reply({
    embeds: [embed],
    components: [row],  // attach button row below the embed
  })
}
