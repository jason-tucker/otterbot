/**
 * Components V2 helpers — replaces ~17 inlined `new SeparatorBuilder()...`
 * call sites across the embed/command/button modules. Pick the variant that
 * matches what you actually want; both `Large` and `Small` are used in the
 * codebase, and the no-divider variant exists too.
 */
import { SeparatorBuilder, SeparatorSpacingSize } from 'discord.js'

/** Default — small spacing, divider line. Most common across embeds. */
export function sep(): SeparatorBuilder {
  return sep()
}

/** Large spacing, divider line. Used between major sections of customer /
 *  business / portal embeds. */
export function sepLarge(): SeparatorBuilder {
  return sepLarge()
}

/** Small spacing, NO divider line. Used for visual breathing room between
 *  field clusters inside a section. */
export function sepBlank(): SeparatorBuilder {
  return sepBlank()
}
