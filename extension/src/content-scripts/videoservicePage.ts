import {
  CourseData,
  DownloadProgressMessage,
  ExtensionOptions,
  ExtensionStorage,
  CourseCrawlMessage,
  DownloadMessage,
  Message,
  VideoScanResultMessage,
  VideoServiceResource,
} from "types"

import { getQuerySelector, parseCourseNameFromCoursePage } from "@shared/parser"
import { sendMessageSafely } from "@shared/helpers"
import logger from "@shared/logger"
import { COMMANDS } from "@shared/constants"

let videoNodes: HTMLAnchorElement[] = []
let videoResources: VideoServiceResource[] = []
let cancel = false
let error = false

async function markVideosAsSeen(hrefs: string[]) {
  const { courseData } = (await chrome.storage.local.get("courseData")) as ExtensionStorage
  const key = location.href
  const existing: CourseData = courseData[key] ?? {
    seenResources: [],
    newResources: [],
    seenActivities: [],
    newActivities: [],
  }
  const updatedSeen = Array.from(new Set([...existing.seenResources, ...hrefs]))
  await chrome.storage.local.set({
    courseData: {
      ...courseData,
      [key]: { ...existing, seenResources: updatedSeen, newResources: [] },
    },
  } satisfies Partial<ExtensionStorage>)
}

async function scanForVideos(options: ExtensionOptions) {
  try {
    videoResources = []
    videoNodes = []

    if (location.href.endsWith("view")) {
      const videoURLSelector = getQuerySelector("videoservice", options)
      const videoElement: HTMLVideoElement | null = document.querySelector(videoURLSelector)

      let fileName = ""
      const mainHTML = document.querySelector("#region-main")
      if (mainHTML) {
        const { textContent } = mainHTML
        if (textContent) {
          fileName = textContent
            .split("\n")
            .map((t) => t.trim())
            .filter((t) => {
              return Boolean(t)
            })[0]
        }
      }

      if (videoElement !== null && fileName !== "") {
        const videoResource: VideoServiceResource = {
          href: location.href,
          src: videoElement.src,
          name: fileName,
          section: "",
          isNew: false,
          isUpdated: false,
          type: "videoservice",
          resourceIndex: 1,
          sectionIndex: 1,
        }
        videoResources.push(videoResource)
      }
    }

    if (location.href.endsWith("browse")) {
      const videoServiceURLs =
        document.querySelectorAll<HTMLAnchorElement>("a[href*='videoservice']")

      videoNodes = Array.from(videoServiceURLs)
        .filter((n) => n.href.endsWith("view"))
        .reduce((nodes, current) => {
          const links = nodes.map((n) => n.href)
          if (!links.includes(current.href)) {
            if (current.textContent !== "") {
              nodes.push(current)
            }
          }
          return nodes
        }, [] as HTMLAnchorElement[])

      videoNodes.forEach((n, i) => {
        const videoResource: VideoServiceResource = {
          href: n.href,
          src: "",
          name: n.textContent ? n.textContent.trim() : "Unknown Video",
          section: "",
          isNew: false,
          isUpdated: false,
          type: "videoservice",
          resourceIndex: i + 1,
          sectionIndex: 1,
        }
        videoResources.push(videoResource)
      })
    }

    // Mark resources as new if not previously seen
    const { courseData } = (await chrome.storage.local.get("courseData")) as ExtensionStorage
    const storedData = courseData[location.href]
    if (storedData) {
      videoResources.forEach((r) => {
        r.isNew = !storedData.seenResources.includes(r.href)
      })
    } else {
      videoResources.forEach((r) => {
        r.isNew = true
      })
    }
  } catch (err) {
    logger.error(err)
    error = true
  }
}

async function getVideoResourceSrc(
  videoResource: VideoServiceResource,
  options: ExtensionOptions
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const videoNode = videoNodes.find((n) => n.href === videoResource.href)
    if (videoNode) {
      videoNode?.click()

      function attemptSrcParsing() {
        const videoURLSelector = getQuerySelector("videoservice", options)
        const videoElement = document.querySelector<HTMLVideoElement>(videoURLSelector)
        const backButton = document.querySelector<HTMLAnchorElement>("a[href$='browse']")

        if (videoElement === null || backButton === null) {
          setTimeout(attemptSrcParsing, 2000)
          return
        }

        backButton?.click()
        resolve(videoElement.src)
      }

      setTimeout(attemptSrcParsing, 3000)
    } else {
      reject()
    }
  })
}

chrome.runtime.onMessage.addListener(async (message: Message) => {
  const { options } = (await chrome.storage.local.get("options")) as ExtensionStorage
  const courseName = parseCourseNameFromCoursePage(document, options)

  const { command } = message
  if (command === COMMANDS.INIT_SCAN) {
    await scanForVideos(options)

    if (error) {
      sendMessageSafely({
        command: COMMANDS.ERROR_VIEW,
      } satisfies Message)
      return
    }

    sendMessageSafely({
      command: COMMANDS.SCAN_RESULT,
      videoResources,
    } satisfies VideoScanResultMessage)
    return
  }

  if (command === COMMANDS.COURSE_CRAWL) {
    const { options, selectedResources } = message as CourseCrawlMessage

    const id = Date.now().toString()
    try {
      if (location.href.endsWith("view")) {
        // A single video is being displayed
        await sendMessageSafely({
          command: COMMANDS.DOWNLOAD,
          id,
          courseLink: "",
          courseName,
          courseShortcut: "",
          resources: videoResources,
          options,
        } satisfies DownloadMessage)
        await sendMessageSafely({
          command: COMMANDS.DOWNLOAD_PROGRESS,
          id,
          courseLink: "",
          courseName,
          completed: videoResources.length,
          total: selectedResources.length,
          errors: 0,
          isDone: true,
        } satisfies DownloadProgressMessage)
        await markVideosAsSeen(videoResources.map((r) => r.href))
      } else if (location.href.endsWith("browse")) {
        // A list of videos is being displayed
        const downloadVideoResources: VideoServiceResource[] = []
        for (let i = 0; i < selectedResources.length; i++) {
          const selectedResource = selectedResources[i]
          const videoResource = videoResources.find((r) => r.href === selectedResource.href)
          if (videoResource) {
            videoResource.src = await getVideoResourceSrc(
              videoResource,
              options as ExtensionOptions
            )
            const completed = i + 1
            sendMessageSafely({
              command: COMMANDS.DOWNLOAD_PROGRESS,
              id,
              courseLink: "",
              courseName,
              completed,
              total: selectedResources.length,
              errors: 0,
              isDone: completed === selectedResources.length,
            } satisfies DownloadProgressMessage)
            downloadVideoResources.push(videoResource)

            if (cancel) {
              cancel = false
              break
            }
          }
        }

        sendMessageSafely({
          command: COMMANDS.DOWNLOAD,
          id,
          courseLink: "",
          courseName,
          courseShortcut: "",
          resources: downloadVideoResources,
          options,
        } satisfies DownloadMessage)
        await markVideosAsSeen(downloadVideoResources.map((r) => r.href))
      }
    } catch (err) {
      logger.error(err)
      error = true
      sendMessageSafely({
        command: COMMANDS.ERROR_VIEW,
      } satisfies Message)
    }
  }

  if (command === COMMANDS.CANCEL_DOWNLOAD) {
    sendMessageSafely({
      command: COMMANDS.CANCEL_DOWNLOAD,
    } satisfies Message)
    cancel = true
  }
})
