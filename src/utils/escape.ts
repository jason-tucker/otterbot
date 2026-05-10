/**
 * Escape user-supplied text before interpolation into Discord markdown.
 *
 * The `allowedMentions: { parse: [] }` we set globally already neuters
 * `@everyone` / `@here` / role / user pings. These helpers cover the markdown
 * surface that allowedMentions doesn't touch — code-span breaks, link-syntax
 * injection, formatting hijack.
 */

/**
 * Strip backticks from text destined for an inline `code span`. A single
 * backtick in the input would otherwise close the span early and let the
 * remainder render as markdown (or break the layout).
 *
 * We strip rather than escape because backticks aren't useful inside a
 * code-span representation of a phone number / name / item label, and
 * Discord's escape sequence (\`) renders inconsistently inside a code span.
 */
export function safeInlineCode(input: string): string {
  return input.replace(/`+/g, '')
}

/**
 * Escape characters that affect markdown link / formatting rendering when
 * interpolating into a `[label](url)` link. `]` / `[` / `(` / `)` / `\` need
 * to be neutered to prevent label-injection breaking out of the brackets.
 */
export function safeMarkdownLinkLabel(input: string): string {
  return input.replace(/[\\\]\[()]/g, (m) => `\\${m}`)
}

/**
 * General-purpose escape for free-text dropped into a Discord message body
 * (no code span, no link). Backslash-escapes the formatting characters that
 * would otherwise change how surrounding text renders.
 */
export function safeMarkdown(input: string): string {
  return input.replace(/[\\`*_~|>]/g, (m) => `\\${m}`)
}
