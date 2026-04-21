import {
  SetBadgeMessage,
  ExtensionStorage,
  DashboardCourseData,
} from "types"

import Course from "models/Course"
import { COMMANDS } from "./constants"
import { browserName } from "detect-browser"

export const isDev = process.env.NODE_ENV !== "production"
export const isDebug = process.env.NODE_ENV === "debug"

function isDisconnectedError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true
  const msg = error instanceof Error ? error.message : String(error)
  return /Receiving end does not exist|Could not establish connection|Actor.*destroyed/i.test(msg)
}

export async function sendMessageSafely(message: unknown): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message)
  } catch (error) {
    if (!isDisconnectedError(error)) throw error
  }
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs?.shift()
}

export const isFirefox = browserName(navigator?.userAgent) === "firefox"

export function getUpdatesFromCourses(courses: Course[]): number {
  const courseList = courses.flat()
  const nUpdates = courseList.reduce((sum, c) => {
    const nUpdatesInCourse = [...c.resources, ...c.activities].filter(
      (r) => r.isNew || r.isUpdated
    ).length
    return sum + nUpdatesInCourse
  }, 0)
  return nUpdates
}

export async function updateIconFromCourses(courses: Course[]) {
  const nUpdates = getUpdatesFromCourses(courses)

  await chrome.storage.local.set({ nUpdates } satisfies Partial<ExtensionStorage>)

  // If there are no further updates reset the icon
  const text = nUpdates === 0 ? "" : nUpdates.toString()
  sendMessageSafely({
    command: COMMANDS.SET_BADGE,
    text,
    global: false,
  } satisfies SetBadgeMessage)
}

export function getCourseDownloadId(command: string, course: Course | DashboardCourseData) {
  return `${command}_${course.link}`;
}