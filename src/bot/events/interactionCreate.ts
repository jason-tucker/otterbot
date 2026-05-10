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
import { execute as executeEmployee, data as employeeData } from '../../commands/employee'
import { execute as executePortal, data as portalData } from '../../commands/portal'
import { execute as executeUserLookup } from '../../commands/userLookup'
import { execute as executeEmployeeContextMenu } from '../../commands/employeeContextMenu'
import { handlePrintInfoButton } from '../../interactions/buttons/printInfoButton'
import { handleCakedButton } from '../../interactions/buttons/cakedButton'
import { handleCakedContactSubmit } from '../../interactions/modals/cakedContactSubmit'
import { handleCakedEventSubmit } from '../../interactions/modals/cakedEventSubmit'
import { handleSendToChannel } from '../../utils/sendable'
import { handleBusinessSelect } from '../../interactions/selects/businessSelect'
import { handleCharacterSelect } from '../../interactions/selects/characterSelect'
import { recordActivity } from '../../services/presence'
import { handleNoteTypeSelect } from '../../interactions/selects/noteTypeSelect'
import { handleBusinessSearchButton } from '../../interactions/buttons/businessSearchButton'
import { handleBusinessSearchSubmit } from '../../interactions/modals/businessSearchSubmit'
import { handleNoteAddButton } from '../../interactions/buttons/noteAdd'
import { handleNoteViewButton } from '../../interactions/buttons/noteView'
import { handleBusinessLookupButton } from '../../interactions/buttons/businessLookupButton'
import { handleBusinessEmployeeSelect } from '../../interactions/selects/businessEmployeeSelect'
import { handleEmployeeBusinessSelect } from '../../interactions/selects/employeeBusinessSelect'
import { handleEmployeeCustomRoleSelect } from '../../interactions/selects/employeeCustomRoleSelect'
import { handleEmployeeActionButton } from '../../interactions/buttons/employeeActionButton'
import { handlePortalButton } from '../../interactions/buttons/portalButton'
import { handlePortalSelect } from '../../interactions/selects/portalSelect'
import { handleTicketCharSelect } from '../../interactions/selects/ticketCharSelect'
import { handlePortalModal } from '../../interactions/modals/portalModal'
import { handleNoteSubmit } from '../../interactions/modals/noteSubmit'
import { handleOCButton } from '../../interactions/buttons/ocButton'
import { handleOCItemSelect } from '../../interactions/selects/ocItemSelect'
import { handleOCAddSubmit } from '../../interactions/modals/ocAddModal'
import { handleOCUrlSubmit } from '../../interactions/modals/ocUrlModal'
import { execute as executeOC, data as ocData } from '../../commands/oc'
import { execute as executeReport, data as reportData } from '../../commands/report'
import { handleReportSubmit } from '../../interactions/modals/reportSubmit'

const commandHandlers = new Map<string, (i: ChatInputCommandInteraction) => Promise<void>>([
  [lookupData.name, executeLookup],
  [businessData.name, executeBusiness],
  [moveChannelData.name, executeMoveChannel],
  [printInfoData.name, executePrintInfo],
  [artSizeData.name, executeArtSize],
  [tcSheetData.name, executeTcSheet],
  [cakedData.name, executeCaked],
  [helpData.name, executeHelp],
  [employeeData.name, executeEmployee],
  [portalData.name, executePortal],
  [ocData.name, executeOC],
  [reportData.name, executeReport],
])

export function registerInteractionCreate(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      recordActivity()
      if (interaction.isChatInputCommand()) {
        const handler = commandHandlers.get(interaction.commandName)
        if (handler) await handler(interaction)
        return
      }

      if (interaction.isUserContextMenuCommand()) {
        const cmd = interaction as UserContextMenuCommandInteraction
        if (cmd.commandName === 'Lookup') {
          await executeUserLookup(cmd)
        } else if (cmd.commandName === 'Manage Employee') {
          await executeEmployeeContextMenu(cmd)
        }
        return
      }

      if (interaction.isStringSelectMenu()) {
        const id = interaction.customId
        if (id.startsWith('lookup_business_select:')) {
          await handleBusinessSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('lookup_char_select:')) {
          await handleCharacterSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('note_type_select:')) {
          await handleNoteTypeSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('business_employee_select:')) {
          await handleBusinessEmployeeSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('emp_business_select:')) {
          await handleEmployeeBusinessSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('emp_custom_role:')) {
          await handleEmployeeCustomRoleSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('portal_biz_select:') || id.startsWith('portal_rm_role:') || id.startsWith('portal_rm_owner:')) {
          await handlePortalSelect(interaction as StringSelectMenuInteraction)
        } else if (id.startsWith('ticket_char_select:')) {
          await handleTicketCharSelect(interaction as StringSelectMenuInteraction)
        } else if (id === 'oc_item_select') {
          await handleOCItemSelect(interaction as StringSelectMenuInteraction)
        } else if (id === 'help:section') {
          const { handleHelpSelect } = await import('../../interactions/selects/helpSelect')
          await handleHelpSelect(interaction as StringSelectMenuInteraction)
        }
        return
      }

      if (interaction.isButton()) {
        const id = interaction.customId
        if (id.startsWith('note_add:')) {
          await handleNoteAddButton(interaction as ButtonInteraction)
        } else if (id.startsWith('note_view:')) {
          await handleNoteViewButton(interaction as ButtonInteraction)
        } else if (id.startsWith('print_info:')) {
          await handlePrintInfoButton(interaction as ButtonInteraction)
        } else if (id === 'help:back') {
          // Use the button-specific renderer (deferUpdate path) instead of
          // re-running execute(), which deferReply'd against an already-acked
          // ButtonInteraction and crashed.
          const { executeFromBackButton } = await import('../../commands/help')
          await executeFromBackButton(interaction as ButtonInteraction)
        } else if (id.startsWith('send_to_channel:')) {
          await handleSendToChannel(interaction as ButtonInteraction)
        } else if (id.startsWith('caked:')) {
          await handleCakedButton(interaction as ButtonInteraction)
        } else if (id.startsWith('business_lookup:')) {
          await handleBusinessLookupButton(interaction as ButtonInteraction)
        } else if (id.startsWith('business_search:')) {
          await handleBusinessSearchButton(interaction as ButtonInteraction)
        } else if (id.startsWith('emp_')) {
          await handleEmployeeActionButton(interaction as ButtonInteraction)
        } else if (id.startsWith('portal_')) {
          await handlePortalButton(interaction as ButtonInteraction)
        } else if (id.startsWith('oc_')) {
          await handleOCButton(interaction as ButtonInteraction)
        } else if (id.startsWith('report_approve_') || id.startsWith('report_reject_')) {
          const { handleReportReview } = await import('../../interactions/buttons/reportReview')
          await handleReportReview(interaction as ButtonInteraction)
        } else if (id.startsWith('ticket_account_made:')) {
          const { handleTicketAccountMadeButton } = await import('../../interactions/buttons/ticketAccountMade')
          await handleTicketAccountMadeButton(interaction as ButtonInteraction)
        } else if (id.startsWith('ticket_account_help:')) {
          const { handleTicketAccountHelpButton } = await import('../../interactions/buttons/ticketAccountMade')
          await handleTicketAccountHelpButton(interaction as ButtonInteraction)
        }
        return
      }

      if (interaction.isModalSubmit()) {
        const id = interaction.customId
        if (id.startsWith('note_submit:')) {
          await handleNoteSubmit(interaction as ModalSubmitInteraction)
        } else if (id.startsWith('business_search_submit:')) {
          await handleBusinessSearchSubmit(interaction as ModalSubmitInteraction)
        } else if (id === 'caked_contact_submit') {
          await handleCakedContactSubmit(interaction as ModalSubmitInteraction)
        } else if (id === 'caked_event_submit') {
          await handleCakedEventSubmit(interaction as ModalSubmitInteraction)
        } else if (id.startsWith('portal_') && id.includes('_modal:')) {
          await handlePortalModal(interaction as ModalSubmitInteraction)
        } else if (id === 'oc_add_submit') {
          await handleOCAddSubmit(interaction as ModalSubmitInteraction)
        } else if (id.startsWith('oc_url_submit:')) {
          await handleOCUrlSubmit(interaction as ModalSubmitInteraction)
        } else if (id === 'report:submit') {
          await handleReportSubmit(interaction as ModalSubmitInteraction)
        }
        return
      }
    } catch (err) {
      // Structured context — without `cmd=…` / `id=…` / `user=…` / `guild=…`,
      // tracing an "Interaction error" entry to a specific button or command
      // meant grepping the customId out of stack frames.
      const tag = interaction.isChatInputCommand() ? `cmd=${interaction.commandName}`
        : interaction.isContextMenuCommand() ? `ctx=${interaction.commandName}`
        : interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()
          ? `id=${interaction.customId}`
          : `type=${interaction.type}`
      const userTag = `user=${interaction.user.id}`
      const guildTag = interaction.guildId ? `guild=${interaction.guildId}` : 'guild=dm'
      console.error(`Interaction error: ${tag} ${userTag} ${guildTag}`, err)
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
