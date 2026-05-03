import {
  type Client,
  type Interaction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  UserContextMenuCommandInteraction,
} from 'discord.js'
import { execute as executeLookup, data as lookupData } from '../../commands/lookup'
import { execute as executeBusiness, data as businessData } from '../../commands/business'
import { execute as executeMoveChannel, data as moveChannelData } from '../../commands/moveChannel'
import { execute as executePrintInfo, data as printInfoData } from '../../commands/printInfo'
import { execute as executeArtSize, data as artSizeData } from '../../commands/artSize'
import { execute as executeTcSheet, data as tcSheetData } from '../../commands/tcSheet'
import { execute as executeCaked, data as cakedData } from '../../commands/caked'
import { execute as executeHelp, data as helpData } from '../../commands/help'
import { execute as executeUserLookup } from '../../commands/userLookup'
import { handlePrintInfoButton } from '../../interactions/buttons/printInfoButton'
import { handleCakedButton } from '../../interactions/buttons/cakedButton'
import { handleCakedContactSubmit } from '../../interactions/modals/cakedContactSubmit'
import { handleCakedEventSubmit } from '../../interactions/modals/cakedEventSubmit'
import { handleSendToChannel } from '../../utils/sendable'
import { handleBusinessSelect } from '../../interactions/selects/businessSelect'
import { handleCharacterSelect } from '../../interactions/selects/characterSelect'
import { handleStandingSelect } from '../../interactions/selects/standingSelect'
import { handleNoteAddButton } from '../../interactions/buttons/noteAdd'
import { handleNoteViewButton } from '../../interactions/buttons/noteView'
import { handleStandingChangeButton } from '../../interactions/buttons/standingChange'
import { handleBusinessLookupButton } from '../../interactions/buttons/businessLookupButton'
import { handleBusinessEmployeeSelect } from '../../interactions/selects/businessEmployeeSelect'
import { handleNoteSubmit } from '../../interactions/modals/noteSubmit'
import { handleStandingSubmit } from '../../interactions/modals/standingSubmit'

const commandHandlers = new Map<string, (i: ChatInputCommandInteraction) => Promise<void>>([
  [lookupData.name, executeLookup],
  [businessData.name, executeBusiness],
  [moveChannelData.name, executeMoveChannel],
  [printInfoData.name, executePrintInfo],
  [artSizeData.name, executeArtSize],
  [tcSheetData.name, executeTcSheet],
  [cakedData.name, executeCaked],
  [helpData.name, executeHelp],
])

export function registerInteractionCreate(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const handler = commandHandlers.get(interaction.commandName)
        if (handler) await handler(interaction)
        return
      }

      if (interaction.isUserContextMenuCommand()) {
        await executeUserLookup(interaction as UserContextMenuCommandInteraction)
        return
      }

      if (interaction.isStringSelectMenu()) {
        const id = interaction.customId
        if (id.startsWith('lookup_business_select:')) {
          await handleBusinessSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('lookup_char_select:')) {
          await handleCharacterSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('standing_select:')) {
          await handleStandingSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('business_employee_select:')) {
          await handleBusinessEmployeeSelect(interaction as StringSelectMenuInteraction)
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
        } else if (id.startsWith('send_to_channel:')) {
          await handleSendToChannel(interaction as ButtonInteraction)
        } else if (id.startsWith('caked:')) {
          await handleCakedButton(interaction as ButtonInteraction)
        } else if (id.startsWith('business_lookup:')) {
          await handleBusinessLookupButton(interaction as ButtonInteraction)
        }
        return
      }

      if (interaction.isModalSubmit()) {
        const id = interaction.customId
        if (id.startsWith('note_submit:')) {
          await handleNoteSubmit(interaction as ModalSubmitInteraction)
        } else if (id.startsWith('standing_submit:')) {
          await handleStandingSubmit(interaction as ModalSubmitInteraction)
        } else if (id === 'caked_contact_submit') {
          await handleCakedContactSubmit(interaction as ModalSubmitInteraction)
        } else if (id === 'caked_event_submit') {
          await handleCakedEventSubmit(interaction as ModalSubmitInteraction)
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
