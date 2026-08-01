/**
 * Components V2 helpers — replaces ~17 inlined `new SeparatorBuilder()...`
 * call sites across the embed/command/button modules. Pick the variant that
 * matches what you actually want; both `Large` and `Small` are used in the
 * codebase, and the no-divider variant exists too.
 */
import { SeparatorBuilder, SeparatorSpacingSize, ContainerBuilder, TextDisplayBuilder, MessageFlags } from 'discord.js'

/** Default — small spacing, divider line. Most common across embeds. */
export function sep(): SeparatorBuilder {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
}

/** Large spacing, divider line. Used between major sections of customer /
 *  business / portal embeds. */
export function sepLarge(): SeparatorBuilder {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
}

/** Small spacing, NO divider line. Used for visual breathing room between
 *  field clusters inside a section. */
export function sepBlank(): SeparatorBuilder {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
}

/** A single-container CV2-safe error/status card. Use for any `editReply`/`update`
 *  on a message that already carries `MessageFlags.IsComponentsV2` — that flag is
 *  permanent, so a later edit can never set `content`, only `components`. */
export function v2Text(msg: string, accentColor = 0x95a5a6) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().setAccentColor(accentColor).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(msg)
      ),
    ] as any[],
  }
}
