// discord.js v14 types don't fully reflect Components V2 — ContainerBuilder
// is a valid top-level component but is missing from BaseMessageOptions.components.
// This augmentation widens the type to accept it, matching actual runtime behavior.
import 'discord.js'

declare module 'discord.js' {
  interface BaseMessageOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components?: any[]
  }
}
