import { ref } from "vue"
import { ExtensionOptions, Message, SelectionTab, StoredCourseData } from "@types"
import { COMMANDS } from "@shared/constants"

export const activeTab = ref<chrome.tabs.Tab>()
export const options = ref<ExtensionOptions>()
export const browserId = ref("")
export const overviewCourseLinks = ref<string[]>()
export const nUpdates = ref(0)
export const courseData = ref<StoredCourseData>()
export const currentSelectionTab = ref<SelectionTab>()
export const onlyNewResources = ref(false)

// Returns true if the message reached a content script, false if the active
// tab has no listener (e.g. on a non-Moodle page).
export async function updateState(): Promise<boolean> {
  if (!activeTab.value?.id) return false
  try {
    await chrome.tabs.sendMessage(activeTab.value.id, {
      command: COMMANDS.GET_STATE,
    } satisfies Message)
    return true
  } catch {
    return false
  }
}
