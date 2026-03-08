<template>
  <files-view-layout
    view="course"
    :resources="resources"
    :activities="activities"
    @download="onDownload"
    @mark-as-seen="onMarkAsSeen"
  >
    <template #simple-selection>
      <label v-for="cat in categoryStats" :key="cat.key" v-show="cat.alwaysShow || cat.total > 0 || cat.nNew > 0">
        <input v-model="downloads[cat.key]" type="checkbox" :disabled="onlyNewResources ? cat.nNew + cat.nUpdated === 0 : cat.total === 0" />
        <span class="ml-1">
          {{ onlyNewResources ? cat.nNew + cat.nUpdated : cat.total }}
          {{ cat.displayLabel }}
        </span>
      </label>
    </template>

    <template #detailed-selection>
      <detailed-resource-selection :resources="resources" />
    </template>
  </files-view-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from "vue"
import { sendEvent } from "@shared/helpers"
import { isAssignment, RESOURCE_CATEGORIES } from "@shared/resourceHelpers"
import { Resource, Activity, Message, CourseScanResultMessage } from "@types"
import FilesViewLayout from "../components/FilesViewLayout.vue"
import DetailedResourceSelection from "../components/DetailedResourceSelection.vue"
import { options, activeTab, currentSelectionTab, onlyNewResources } from "../state"
import { COMMANDS } from "@shared/constants"

// Resources
const resources = ref<Resource[]>([])
const activities = ref<Activity[]>([])

const categoryStats = computed(() =>
  RESOURCE_CATEGORIES.map((cat) => {
    const filtered = resources.value.filter(cat.filter)
    return {
      ...cat,
      total: filtered.length,
      nNew: filtered.filter((r) => r.isNew).length,
      nUpdated: filtered.filter((r) => r.isUpdated).length,
      displayLabel: cat.key === "folder" && filtered.some(isAssignment) ? "assignment(s)" : cat.label,
    }
  })
)

const nNewAndUpdatedResources = computed(() =>
  categoryStats.value.reduce((sum, c) => sum + c.nNew + c.nUpdated, 0)
)
const nNewActivities = computed(() => activities.value.filter((a) => a.isNew).length)

// Checkboxes
const downloads = reactive<Record<string, boolean>>(
  Object.fromEntries(RESOURCE_CATEGORIES.map((c) => [c.key, false]))
)

const setCheckboxState = () => {
  for (const cat of categoryStats.value) {
    downloads[cat.key] = onlyNewResources.value
      ? cat.nNew + cat.nUpdated !== 0
      : cat.total !== 0
  }
}

const setSelected = (catKey: string) => {
  const cat = RESOURCE_CATEGORIES.find((c) => c.key === catKey)!
  resources.value.filter(cat.filter).forEach((r) => {
    if (onlyNewResources.value) {
      r.selected = downloads[catKey] && (r.isNew || r.isUpdated)
    } else {
      r.selected = downloads[catKey]
    }
  })
}

const setAllSelected = () => RESOURCE_CATEGORIES.forEach((c) => setSelected(c.key))

for (const cat of RESOURCE_CATEGORIES) {
  watch(() => downloads[cat.key], () => setSelected(cat.key))
}

watch(onlyNewResources, () => {
  if (currentSelectionTab.value?.id === "simple") {
    setCheckboxState()
  }
  setAllSelected()
})

// Selection Tab
watch(currentSelectionTab, () => {
  if (currentSelectionTab.value?.id === "simple") {
    setCheckboxState()
  } else if (currentSelectionTab.value?.id === "detailed") {
    for (const key of Object.keys(downloads)) downloads[key] = false
  }
  setAllSelected()
})

// Download
const onDownload = (selectedResources: Resource[]) => {
  const eventParts = ["download-course-page", currentSelectionTab.value?.id]
  if (onlyNewResources.value) {
    eventParts.push("only-new")
  }
  sendEvent(eventParts.join("-"), true, { numberOfFiles: selectedResources.length })
}

// Mark as seen
const onMarkAsSeen = () => {
  sendEvent("mark-as-seen-course-page", true)
  resources.value.forEach((r) => {
    r.isNew = false
    r.isUpdated = false
  })
}

chrome.runtime.onMessage.addListener(async (message: Message) => {
  const { command } = message
  if (command === COMMANDS.SCAN_RESULT) {
    const { course } = message as CourseScanResultMessage
    const { resources: detectedResources, activities: detectedActivities } = course
    resources.value = detectedResources.map((r) => ({ ...r, selected: false }))
    activities.value = detectedActivities

    if (nNewAndUpdatedResources.value > 0) {
      onlyNewResources.value = options.value?.onlyNewResources ?? false
    }

    if (nNewActivities.value > 0) {
      if (activeTab.value?.id) {
        chrome.tabs.sendMessage(activeTab.value.id, {
          command: COMMANDS.UPDATE_ACTIVITIES,
        } satisfies Message)
      }
    }

    setCheckboxState()
    setAllSelected()
  }
})

if (activeTab.value?.id) {
  chrome.tabs.sendMessage(activeTab.value.id, {
    command: COMMANDS.INIT_SCAN,
  } satisfies Message)
}
</script>
