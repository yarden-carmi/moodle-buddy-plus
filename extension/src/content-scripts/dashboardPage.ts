import shajs from "sha.js"
import {
  DashboardDownloadCourseMessage,
  DashboardScanResultMessage,
  DownloadMessage,
  MarkAsSeenMessage,
  Message,
  ScanInProgressMessage,
  ExtensionStorage,
  DashboardUpdateCourseMessage,
  DashboardCourseData,
} from "types"
import { checkForMoodle, parseCourseLink } from "@shared/parser"
import { updateIconFromCourses, isDebug, getCourseDownloadId } from "@shared/helpers"
import Course from "../models/Course"
import { getURLRegex } from "@shared/regexHelpers"
import logger from "@shared/logger"
import { COMMANDS } from "@shared/constants"

const SCAN_CONCURRENCY = 5

let error = false
let scanInProgress = true
let scanTotal = 0
let scanCompleted = 0
let collapsedTotal = 0
let collapsedCompleted = 0
let courses: Course[] = []
const scannedLinks = new Set<string>()
const courseGroups = new Map<string, string>() // link → FCL group label
let lastSettingsHash = ""

function getOverviewSettings() {
  const settingsDiv: HTMLElement | null = document.querySelector("[data-region='courses-view']")
  if (settingsDiv) return settingsDiv.dataset
  return null
}

function hasHiddenParent(element: HTMLElement): boolean {
  if (element === null || element.tagName === "HTML") return false
  if (getComputedStyle(element).display === "none" || element.hidden) return true
  return element.parentElement !== null && hasHiddenParent(element.parentElement)
}

function safeSend(message: object) {
  try {
    chrome.runtime.sendMessage(message)
  } catch {
    // Extension context invalidated (e.g. reloaded during scan) — ignore
  }
}

function sendScanProgress() {
  safeSend({
    command: COMMANDS.SCAN_IN_PROGRESS,
    completed: scanCompleted,
    total: scanTotal,
  } satisfies ScanInProgressMessage)
}

function sendCollapsedProgress() {
  safeSend({
    command: COMMANDS.SCAN_IN_PROGRESS,
    completed: scanCompleted,
    total: scanTotal,
    collapsedCompleted,
    collapsedTotal,
  } satisfies ScanInProgressMessage)
}

function courseToDashboardCourseData(course: Course): DashboardCourseData {
  return {
    name: course.name,
    link: course.link,
    isNew: course.isFirstScan,
    isCollapsed: !scannedLinks.has(course.link),
    resources: course.resources,
    activities: course.activities,
    group: courseGroups.get(course.link),
  } satisfies DashboardCourseData
}

function sendScanResults() {
  safeSend({
    command: COMMANDS.SCAN_RESULT,
    courses: courses.map(courseToDashboardCourseData),
  } satisfies DashboardScanResultMessage)
}

async function fetchWithRetry(url: string, retries = 2, delayMs = 1000): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url)
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw new Error("unreachable")
}

async function runParallel<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit = SCAN_CONCURRENCY
): Promise<void> {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) || 1 }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()!
        await fn(item)
      }
    })
  )
}

// If a course was fetched for name only (Phase 2), scan it in-place using the stored HTMLDocument.
async function ensureCourseScanned(link: string): Promise<Course> {
  const course = courses.find((c) => c.link === link)
  if (!course) throw new Error(`Course not found: ${link}`)
  if (!scannedLinks.has(link)) {
    const { options } = (await chrome.storage.local.get("options")) as ExtensionStorage
    course.options = options
    await course.scan()
    scannedLinks.add(link)
  }
  return course
}

async function scanOverview(retry = 0) {
  try {
    const maxRetries = 2
    scanInProgress = true
    scanTotal = 0
    scanCompleted = 0
    collapsedTotal = 0
    collapsedCompleted = 0
    courses = []
    scannedLinks.clear()
    courseGroups.clear()

    const { options } = (await chrome.storage.local.get("options")) as ExtensionStorage
    let courseLinks: string[] = []
    const collapsedLinks: string[] = []

    sendScanProgress()

    await new Promise((resolve) => setTimeout(resolve, retry === 0 ? 500 : 2000))

    lastSettingsHash = shajs("sha224").update(JSON.stringify(getOverviewSettings())).digest("hex")

    let useFallback = false

    const overviewNode = document.querySelector("[data-region='myoverview']")
    if (overviewNode) {
      const courseNodes = overviewNode.querySelectorAll("[data-region='course-content']")
      if (courseNodes.length !== 0) {
        courseLinks = Array.from(courseNodes).map((n) => parseCourseLink(n.innerHTML))
      } else {
        useFallback = true
      }
    } else {
      useFallback = true
    }

    useFallback = true
    if (useFallback) {
      const coursePageRegex = getURLRegex("course")
      const searchRoot = document.querySelector("#region-main")
      if (searchRoot) {
        courseLinks = Array.from(searchRoot.querySelectorAll<HTMLAnchorElement>("a"))
          .filter((n) => n.href.match(coursePageRegex) && !hasHiddenParent(n))
          .map((n) => n.href)
      }

      if (courseLinks.length === 0) {
        const fclPanels = document.querySelectorAll<HTMLElement>(".block-fcl__list")
        if (fclPanels.length > 0) {
          fclPanels.forEach((panel) => {
            const isCollapsed = panel.getAttribute("aria-hidden") === "true"
            const tabId = panel.getAttribute("aria-labelledby")
            const groupLabel = tabId
              ? document.getElementById(tabId)?.textContent?.trim() ?? ""
              : ""

            panel.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
              if (!a.href.match(coursePageRegex)) return
              courseGroups.set(a.href, groupLabel)
              if (isCollapsed) {
                collapsedLinks.push(a.href)
              } else {
                courseLinks.push(a.href)
              }
            })
          })
        } else {
          courseLinks = Array.from(document.body.querySelectorAll<HTMLAnchorElement>("a"))
            .filter((n) => n.href.match(coursePageRegex))
            .map((n) => n.href)
        }
      }
    }

    if (courseLinks.length === 0 && collapsedLinks.length === 0) {
      if (retry < maxRetries) {
        logger.info("No course found in dashboard. Retrying once more...")
        scanOverview(retry + 1)
        return
      }
    } else {
      // Deduplicate
      const uniqueVisible = Array.from(new Set(courseLinks))
      const uniqueCollapsed = Array.from(new Set(collapsedLinks)).filter(
        (l) => !uniqueVisible.includes(l)
      )

      const visibleLinks = uniqueVisible.slice(0, options.maxCoursesOnDashboardPage)
      scanTotal = visibleLinks.length

      if (isDebug) {
        logger.debug({ visibleLinks, collapsedLinks: uniqueCollapsed })
        return
      }

      const domParser = new DOMParser()

      // Phase 1: scan visible (expanded) courses fully
      await runParallel(visibleLinks, async (link) => {
        try {
          const res = await fetchWithRetry(link)
          if (link !== res.url) {
            scanTotal--
            sendScanProgress()
            return
          }
          const doc = domParser.parseFromString(await res.text(), "text/html")
          const course = new Course(link, doc, options)
          await course.scan()
          scannedLinks.add(link)
          courses.push(course)
          scanCompleted++
        } catch (err) {
          scanTotal--
          logger.warn(err)
        }
        sendScanProgress()
      })

      // Phase 2: fetch collapsed courses for name only (no resource scan)
      collapsedTotal = uniqueCollapsed.length
      await runParallel(uniqueCollapsed, async (link) => {
        try {
          const res = await fetchWithRetry(link)
          if (link !== res.url) {
            collapsedTotal--
            sendCollapsedProgress()
            return
          }
          const doc = domParser.parseFromString(await res.text(), "text/html")
          const collapsedCourse = new Course(link, doc, options)
          courses.push(collapsedCourse)
          collapsedCompleted++
        } catch (err) {
          collapsedTotal--
          logger.warn(err)
        }
        sendCollapsedProgress()
      })

      chrome.storage.local.set({
        overviewCourseLinks: courses.map((c) => c.link),
      } satisfies Partial<ExtensionStorage>)

      updateIconFromCourses(courses.filter((c) => scannedLinks.has(c.link)))
    }

    scanInProgress = false
    sendScanResults()
  } catch (err) {
    error = true
    logger.error(err)
  }
}

const isMoodlePage = checkForMoodle()

if (isMoodlePage) {
  scanOverview()
}

chrome.runtime.onMessage.addListener(async (message: Message) => {
  const { command } = message

  if (command === COMMANDS.INIT_SCAN) {
    if (error) {
      chrome.runtime.sendMessage({ command: COMMANDS.ERROR_VIEW } satisfies Message)
      return
    }

    if (scanInProgress) {
      sendScanProgress()
    } else {
      if (error) {
        chrome.runtime.sendMessage({ command: COMMANDS.ERROR_VIEW } satisfies Message)
        return
      }

      const currentSettingsHash = shajs("sha224")
        .update(JSON.stringify(getOverviewSettings()))
        .digest("hex")

      if (currentSettingsHash !== lastSettingsHash) {
        lastSettingsHash = currentSettingsHash
        scanOverview()
        return
      }

      if (courses.length === 0) logger.info("empty dashboard")
      sendScanResults()
    }
    return
  }

  if (command === COMMANDS.MARK_AS_SEEN) {
    const { link } = message as MarkAsSeenMessage
    const course = courses.find((c) => c.link === link)
    if (course === undefined) {
      logger.error(`Course with link ${link} is undefined. Failed to process message.`, message)
      return
    }
    await course.updateStoredResources()
    await course.updateStoredActivities()
    await course.scan()
    updateIconFromCourses(courses.filter((c) => scannedLinks.has(c.link)))
  }

  if (command === COMMANDS.DASHBOARD_DOWNLOAD_NEW) {
    const { link } = message as DashboardDownloadCourseMessage
    const course = await ensureCourseScanned(link)
    const { options } = (await chrome.storage.local.get("options")) as ExtensionStorage
    const downloadNodes = course.resources.filter((r) => r.isNew)

    chrome.runtime.sendMessage({
      command: COMMANDS.DOWNLOAD,
      id: getCourseDownloadId(command, course),
      courseLink: course.link,
      courseName: course.name,
      courseShortcut: course.shortcut,
      resources: downloadNodes,
      options,
    } satisfies DownloadMessage)

    await course.updateStoredResources(downloadNodes)
    await course.updateStoredActivities()
    await course.scan()
    updateIconFromCourses(courses.filter((c) => scannedLinks.has(c.link)))

    setTimeout(() => {
      chrome.runtime.sendMessage({
        command: COMMANDS.DASHBOARD_UPDATE_COURSE,
        course: courseToDashboardCourseData(course),
      } satisfies DashboardUpdateCourseMessage)
    }, 500)
  }

  if (command === COMMANDS.ENSURE_CORRECT_BADGE) {
    updateIconFromCourses(courses.filter((c) => scannedLinks.has(c.link)))
  }

  if (command === COMMANDS.DASHBOARD_DOWNLOAD_COURSE) {
    const { options } = (await chrome.storage.local.get("options")) as ExtensionStorage
    const { link } = message as DashboardDownloadCourseMessage
    const course = await ensureCourseScanned(link)
    const id = getCourseDownloadId(command, course)

    chrome.runtime.sendMessage({
      command: COMMANDS.DOWNLOAD,
      id,
      courseLink: course.link,
      courseName: course.name,
      courseShortcut: course.shortcut,
      resources: course.resources,
      options,
    } satisfies DownloadMessage)

    await course.updateStoredResources(course.resources)
    await course.updateStoredActivities()
    await course.scan()
    updateIconFromCourses(courses.filter((c) => scannedLinks.has(c.link)))
  }
})
