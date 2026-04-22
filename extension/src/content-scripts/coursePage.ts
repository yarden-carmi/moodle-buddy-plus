import {
  CourseCrawlMessage,
  CourseScanResultMessage,
  DownloadMessage,
  ExtensionStorage,
  Message,
} from "types"
import { checkForMoodle, parseCourseLink, hasSiblingCourseWithSameName } from "@shared/parser"
import { updateIconFromCourses, getCourseDownloadId, sendMessageSafely } from "@shared/helpers"

import Course from "../models/Course"
import logger from "@shared/logger"
import { COMMANDS } from "@shared/constants"

function sendScanResults(course) {
  sendMessageSafely({
    command: COMMANDS.SCAN_RESULT,
    course: {
      resources: course.resources,
      activities: course.activities,
    },
  } satisfies CourseScanResultMessage)
}

// chrome.storage.local.clear()

async function initCoursePage() {
  const { options } = (await chrome.storage.local.get("options")) as ExtensionStorage
  const courseLink = parseCourseLink(location.href)
  const course = new Course(courseLink, document, options)

  let initialScanCompleted = false

  // Initial scan
  course
    .scan()
    .then(() => {
      updateIconFromCourses([course])

      initialScanCompleted = true
      sendScanResults(course)
    })
    .catch((err) => {
      logger.error(err)
      chrome.runtime.sendMessage({
        command: COMMANDS.ERROR_VIEW,
      } satisfies Message)
    })

  chrome.runtime.onMessage.addListener(async (message: Message) => {
    const { command } = message

    if (command === COMMANDS.INIT_SCAN) {
      if (initialScanCompleted) {
        sendScanResults(course)
      }
      return
    }

    if (command === COMMANDS.MARK_AS_SEEN) {
      await course.updateStoredResources()
      await course.updateStoredActivities()
      await course.scan()
      updateIconFromCourses([course])
      return
    }

    if (command === COMMANDS.UPDATE_ACTIVITIES) {
      await course.updateStoredActivities()
      await course.scan()
      updateIconFromCourses([course])
      return
    }

    if (command === COMMANDS.COURSE_CRAWL) {
      const { options, selectedResources } = message as CourseCrawlMessage

      const hasDup = hasSiblingCourseWithSameName(document, course.link, course.name)
      const dispatchedCourseName =
        hasDup && course.number ? `${course.name} (${course.number})` : course.name

      sendMessageSafely({
        command: COMMANDS.DOWNLOAD,
        id: getCourseDownloadId(command, course),
        courseName: dispatchedCourseName,
        courseShortcut: course.shortcut,
        courseGroup: course.group,
        courseLink: course.link,
        resources: selectedResources,
        options,
      } satisfies DownloadMessage)

      await course.updateStoredResources(selectedResources)
      await course.scan()
      updateIconFromCourses([course])
      sendScanResults(course)
    }

    if (command === COMMANDS.ENSURE_CORRECT_BADGE) {
      updateIconFromCourses([course])
    }
  })
}

const isMoodlePage = checkForMoodle()

if (isMoodlePage) {
  initCoursePage()
}
