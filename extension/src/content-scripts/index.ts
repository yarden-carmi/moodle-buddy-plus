import { COMMANDS } from "@shared/constants"
import { isDev } from "@shared/helpers"
import logger from "@shared/logger"
import { ExtensionStorage, Message, StateMessage } from "@types"
import "./backgroundScanner"
import { detectPage } from "./detector"

logger.debug({ env: process.env.NODE_ENV, isDev: isDev })

const page = detectPage()

chrome.runtime.sendMessage({
  command: COMMANDS.CHECK_BACKGROUND_SCAN,
} as Message)

async function updateVueState() {
  const localStorage = (await chrome.storage.local.get()) as ExtensionStorage
  const { options, nUpdates } = localStorage
  logger.debug({ localStorage })
  chrome.runtime.sendMessage({
    command: COMMANDS.STATE,
    state: { page, options, nUpdates },
  } satisfies StateMessage)
}

chrome.runtime.onMessage.addListener(async (message: Message) => {
  const { command } = message
  logger.debug({ contentCommand: command })

  if (command === COMMANDS.GET_STATE) {
    updateVueState()
  }

})
