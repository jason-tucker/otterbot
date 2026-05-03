import {
  type Client,
  type Interaction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from 'discord.js'
import { execute as executeLookup, data as lookupData } from '../../commands/lookup'
import { execute as executeBusiness, data as businessData } from '../../commands/business'
import { execute as executeMoveChannel, data as moveChannelData } from '../../commands/moveChannel'
import { execute as executePrintInfo, data as printInfoData } from '../../commands/printInfo'
import { handlePrintInfoButton } from '../../interactions/buttons/printInfoButton'
import { handleBusinessSelect } from '../../interactions/selects/businessSelect'
import { handleBusinessInfoSelect } from '../../interactions/selects/businessInfoSelect'
import { handleCharacterSelect } from '../../interactions/selects/characterSelect'
import { handleStandingSelect } from '../../interactions/selects/standingSelect'
import { handleNoteAddButton } from '../../interactions/buttons/noteAdd'
import { handleNoteViewButton } from '../../interactions/buttons/noteView'
import { handleStandingChangeButton } from '../../interactions/buttons/standingChange'
import { handleNoteSubmit } from '../../interactions/modals/noteSubmit'
import { handleStandingSubmit } from '../../interactions/modals/standingSubmit'

const commandHandlers = new Map<string, (i: ChatInputCommandInteraction) => Promise<void>>([
  [lookupData.name, executeLookup],
  [businessData.name, executeBusiness],
  [moveChannelData.name, executeMoveChannel],
  [printInfoData.name, executePrintInfo],
])

export function registerInteractionCreate(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const handler = commandHandlers.get(interaction.commandName)
        if (handler) await handler(interaction)
        return
      }

      if (interaction.isStringSelectMenu()) {
        const id = interaction.customId
        if (id.startsWith('lookup_business_select:')) {
          await handleBusinessSelect(interaction as StringSelectMenuInteraction)
        } else if (id === 'business_info_select') {
          await handleBusinessInfoSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('lookup_char_select:')) {
          await handleCharacterSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('standing_select:')) {
          await handleStandingSelect(interaction as StringSelectMenuInteraction)
        }
        return
      }

      if (interaction.isButton()) {
        const id = interaction.customId
        if (id.startsWith('note_add:')) {
          await handleNoteAddButton(interaction as ButtonInteraction)
        } else if (id.startsWith('note_view:')) {
          await handleNoteViewButton(interaction as ButtonInteraction)
        } else if (id.startsWith('standing_change:')) {
          await handleStandingChangeButton(interaction as ButtonInteraction)
        } else if (id.startsWith('print_info:')) {
          await handlePrintInfoButton(interaction as ButtonInteraction)
        }
        return
      }

      if (interaction.isModalSubmit()) {
        const id = interaction.customId
        if (id.startsWith('note_submit:')) {
          await handleNoteSubmit(interaction as ModalSubmitInteraction)
        } else if (id.startsWith('standing_submit:')) {
          await handleStandingSubmit(interaction as ModalSubmitInteraction)
        }
        return
      }
    } catch (err) {
      console.error('Interaction error:', err)
      try {
        if (interaction.isRepliable() && !interaction.replied) {
          const payload = { content: 'An unexpected error occurred.', ephemeral: true }
          if ('deferred' in interaction && interaction.deferred) {
            await (interaction as ChatInputCommandInteraction).editReply({ content: payload.content })
          } else {
            await interaction.reply(payload)
          }
        }
      } catch {
        // ignore reply errors
      }
    }
  })
}
