import {
  ExtensionOptions,
  ExtensionStorage,
  Resource,
  Activity,
  AssignmentResource,
  FileResource,
  FolderResource,
  ZoomRecordingResource,
  SidebarVideoResource,
  EmbeddedVideoResource,
  CourseData,
} from "types"
import * as parser from "@shared/parser"
import { getMoodleBaseURL, getURLRegex } from "@shared/regexHelpers"
import logger from "@shared/logger"

async function getLastModifiedHeader(href: string, options: ExtensionOptions) {
  if (!options.detectFileUpdates) return

  try {
    const headResponse = await fetch(href, { method: "HEAD" })
    return headResponse.headers.get("last-modified") ?? undefined
  } catch {
    return undefined
  }
}

const courseURLRegex = getURLRegex("course")
const assignmentURLRegex = getURLRegex("assignment")

class Course {
  link: string
  HTMLDocument: Document
  name: string
  shortcut: string
  group: string
  isFirstScan: boolean
  isCoursePage: boolean
  options: ExtensionOptions

  resources: Resource[]
  previousSeenResources: string[] | null

  activities: Activity[]
  previousSeenActivities: string[] | null

  lastModifiedHeaders: Record<string, string | undefined> | undefined

  sectionIndices: Record<string, number>

  constructor(link: string, HTMLDocument: Document, options: ExtensionOptions) {
    this.link = link
    this.HTMLDocument = HTMLDocument
    this.options = options
    this.name = parser.parseCourseNameFromCoursePage(HTMLDocument, options)
    this.shortcut = parser.parseCourseShortcut(HTMLDocument, options)
    this.group = parser.parseCourseGroupFromCoursePage(HTMLDocument, link)
    this.isFirstScan = true
    this.isCoursePage = !!link.match(courseURLRegex)

    this.resources = []
    this.previousSeenResources = null

    this.activities = []
    this.previousSeenActivities = null

    this.sectionIndices = {}
  }

  private getSectionIndex(section: string): number {
    if (this.sectionIndices[section] === undefined) {
      this.sectionIndices[section] = Object.keys(this.sectionIndices).length
    }

    return this.sectionIndices[section] + 1
  }

  private createCourseDataSnapshot(): CourseData {
    const lastModifiedHeaders =
      this.lastModifiedHeaders ?? Object.fromEntries(this.resources.map((r) => [r.href, r.lastModified]))

    return {
      seenResources: this.resources.filter((resource) => !resource.isNew).map((resource) => resource.href),
      newResources: this.resources.filter((resource) => resource.isNew).map((resource) => resource.href),
      seenActivities: this.activities.filter((activity) => !activity.isNew).map((activity) => activity.href),
      newActivities: this.activities.filter((activity) => activity.isNew).map((activity) => activity.href),
      lastModifiedHeaders,
    }
  }

  private addResource(resource: Resource): void {
    if (this.previousSeenResources !== null) {
      const hasNotBeenSeenBefore = !this.previousSeenResources.includes(resource.href)
      if (hasNotBeenSeenBefore) {
        resource.isNew = true
        logger.debug(resource, "New resource detected")
      }

      if (this.options.detectFileUpdates) {
        const hasBeenUpdated =
          (this.lastModifiedHeaders ?? {})[resource.href] !== resource.lastModified
        if (!resource.isNew && hasBeenUpdated) {
          resource.isUpdated = true
        }
      }
    } else {
      // If course has never been scanned previousSeenResources don't exist
      // Never treat a resource as new when the course is scanned for the first time
      // because we're capturing the initial state of the course
      resource.isNew = false
      resource.isUpdated = false
    }

    this.resources.push(resource)
  }

  private async addFile(node: HTMLElement) {
    const href = parser.parseURLFromNode(node, "file", this.options)
    if (href === "") return

    const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
    const sectionIndex = this.getSectionIndex(section)
    const resource: FileResource = {
      href,
      name: parser.parseFileNameFromNode(node),
      section,
      type: "file",
      isNew: false,
      isUpdated: false,
      resourceIndex: this.resources.length + 1,
      sectionIndex,
      lastModified: await getLastModifiedHeader(href, this.options),
    }

    this.addResource(resource)
  }

  private async addPluginFile(node: HTMLElement, partOfFolder = "") {
    let href = parser.parseURLFromNode(node, "pluginfile", this.options)
    if (href === "") return

    // Avoid duplicates
    const detectedURLs = this.resources.map((r) => r.href)
    if (detectedURLs.includes(href)) return

    const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
    const sectionIndex = this.getSectionIndex(section)
    const resource: FileResource = {
      href,
      name: parser.parseFileNameFromPluginFileURL(href),
      section,
      type: "pluginfile",
      partOfFolder,
      isNew: false,
      isUpdated: false,
      resourceIndex: this.resources.length + 1,
      sectionIndex,
      lastModified: await getLastModifiedHeader(href, this.options),
    }

    this.addResource(resource)
  }

  private async addURLNode(node: HTMLElement) {
    // First, check if this URL points to a Zoom recording
    const addedAsZoom = await this.addZoomRecordingFromURLNode(node)
    if (addedAsZoom) return

    // Make sure URL is a downloadable file
    const activityIcon: HTMLImageElement | null = node.querySelector("img.activityicon")
    if (activityIcon) {
      const imgName = activityIcon.src.split("/").pop()
      if (imgName) {
        // "icon" image is usually used for websites but I can't download full websites
        // Only support external URLs when they point to a file
        const isFile = imgName !== "icon"
        if (isFile) {
          // File has been identified as downloadable
          const href = parser.parseURLFromNode(node, "url", this.options)
          if (href === "") return

          const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
          const sectionIndex = this.getSectionIndex(section)
          const resourceNode: FileResource = {
            href,
            name: parser.parseFileNameFromNode(node),
            section,
            type: "url",
            isNew: false,
            isUpdated: false,
            resourceIndex: this.resources.length + 1,
            sectionIndex,
            lastModified: await getLastModifiedHeader(href, this.options),
          }

          this.addResource(resourceNode)
        }
      }
    }
  }

  private static readonly ZOOM_RECORDING_REGEX = /https?:\/\/[^/]*zoom\.[^/]+\/rec\/(share|play)\//i

  private async addZoomRecordingFromURLNode(node: HTMLElement): Promise<boolean> {
    const href = parser.parseURLFromNode(node, "url", this.options)
    if (href === "") return false

    try {
      const res = await fetch(href)
      const doc = new DOMParser().parseFromString(await res.text(), "text/html")
      const targetUrl = doc.querySelector<HTMLAnchorElement>(".urlworkaround a[href]")?.getAttribute("href") || ""
      if (!Course.ZOOM_RECORDING_REGEX.test(targetUrl)) return false

      const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
      const resource: ZoomRecordingResource = {
        href,
        name: parser.parseFileNameFromNode(node),
        section,
        type: "zoom",
        zoomUrl: targetUrl,
        isNew: false,
        isUpdated: false,
        resourceIndex: this.resources.length + 1,
        sectionIndex: this.getSectionIndex(section),
      }
      this.addResource(resource)
      return true
    } catch (err) {
      logger.error("Failed to check URL node for Zoom recording", err)
      return false
    }
  }

  private async addFolder(node: HTMLElement) {
    const href = parser.parseURLFromNode(node, "folder", this.options)

    const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
    const sectionIndex = this.getSectionIndex(section)
    const resource: FolderResource = {
      href,
      name: parser.parseFileNameFromNode(node),
      section,
      type: "folder",
      isInline: false,
      isNew: false,
      isUpdated: false,
      resourceIndex: this.resources.length + 1,
      sectionIndex,
    }

    if (resource.href === "") {
      // Folder could be displayed inline
      const downloadButtonVisible = parser.getDownloadButton(node) !== null
      const { downloadFolderAsZip } = this.options

      if (downloadFolderAsZip && downloadButtonVisible) {
        const downloadIdTag = parser.getDownloadIdTag(node)
        if (downloadIdTag === null) return

        const baseURL = getMoodleBaseURL(this.link)
        const downloadId = downloadIdTag.getAttribute("value")
        const downloadURL = `${baseURL}/mod/folder/download_folder.php?id=${downloadId}`

        resource.href = downloadURL
        resource.isInline = true
      } else {
        // Not downloading via button as ZIP
        // Download folder as individual pluginfiles
        // Look for any pluginfiles
        const folderFiles = node.querySelectorAll<HTMLElement>(
          parser.getQuerySelector("pluginfile", this.options)
        )
        for (const pluginFile of Array.from(folderFiles)) {
          await this.addPluginFile(pluginFile, resource.name)
        }
        return
      }
    }

    if (resource.href !== "") {
      resource.lastModified = await getLastModifiedHeader(resource.href, this.options)
    }

    this.addResource(resource)
  }

  private async addAssignmentResource(href: string, name: string, section: string) {
    this.addResource({
      href,
      name,
      section,
      type: "assignment",
      isNew: false,
      isUpdated: false,
      resourceIndex: this.resources.length + 1,
      sectionIndex: this.getSectionIndex(section),
      lastModified: await getLastModifiedHeader(href, this.options),
    } satisfies AssignmentResource)
  }

  private async addAssignment(node: HTMLElement) {
    const href = parser.parseURLFromNode(node, "activity", this.options)
    if (href === "") return
    const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
    await this.addAssignmentResource(href, parser.parseActivityNameFromNode(node), section)
  }

  private async addCurrentAssignmentPage() {
    const courseName = parser.parseCourseNameFromBreadcrumb(this.HTMLDocument)
    if (courseName) this.name = courseName
    const section = parser.parseSectionFromBreadcrumb(this.HTMLDocument)
    await this.addAssignmentResource(this.link, parser.parseAssignmentNameFromPage(this.HTMLDocument), section)
  }

  private async addEmbeddedVideo(node: HTMLElement) {
    const href = parser.parseURLFromNode(node, "activity", this.options)
    if (href === "") return

    const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
    const sectionIndex = this.getSectionIndex(section)
    const resource: EmbeddedVideoResource = {
      href,
      name: parser.parseFileNameFromNode(node),
      section,
      type: "embedded-video",
      isNew: false,
      isUpdated: false,
      resourceIndex: this.resources.length + 1,
      sectionIndex,
    }

    this.addResource(resource)
  }

  private addSidebarVideos() {
    const sidebarVideoLinks = this.HTMLDocument.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/blocks/video/viewvideo"]'
    )

    for (const link of Array.from(sidebarVideoLinks)) {
      const href = link.href
      if (!href) continue

      // Avoid duplicates
      if (this.resources.some((r) => r.href === href)) continue

      // Get name from the nearest text link (some are just thumbnail links)
      let name = link.textContent?.trim() || ""
      if (!name) {
        // This might be a thumbnail link; find the sibling text link
        const parent = link.closest("[class]")?.parentElement
        if (parent) {
          const textLink = parent.querySelector<HTMLAnchorElement>('a[href*="/blocks/video/viewvideo"]:not(:has(img))')
          name = textLink?.textContent?.trim() || ""
        }
      }
      if (!name) continue

      const resource: SidebarVideoResource = {
        href,
        name,
        section: "Sidebar Videos",
        type: "sidebar-video",
        isNew: false,
        isUpdated: false,
        resourceIndex: this.resources.length + 1,
        sectionIndex: this.getSectionIndex("Sidebar Videos"),
      }

      this.addResource(resource)
    }
  }

  private async addActivity(node: HTMLElement) {
    if (!this.isCoursePage) {
      return
    }

    const activityType = parser.parseActivityTypeFromNode(node)
    if (activityType === "assign") {
      await this.addAssignment(node)
      return
    }

    if (activityType === "videostream") {
      await this.addEmbeddedVideo(node)
      return
    }

    const section = parser.parseSectionName(node, this.HTMLDocument, this.options)
    const sectionIndex = this.getSectionIndex(section)
    const href = parser.parseURLFromNode(node, "activity", this.options)
    if (href === "") return

    const activity: Activity = {
      href,
      name: parser.parseActivityNameFromNode(node),
      section: parser.parseSectionName(node, this.HTMLDocument, this.options),
      isNew: false,
      isUpdated: false,
      type: "activity",
      activityType,
      resourceIndex: this.activities.length + 1,
      sectionIndex,
    }

    if (
      this.previousSeenActivities !== null &&
      !this.previousSeenActivities.includes(activity.href)
    ) {
      activity.isNew = true
    }

    this.activities.push(activity)
  }

  async scan(testLocalStorage?: ExtensionStorage): Promise<void> {
    this.resources = []
    this.previousSeenResources = null

    this.activities = []
    this.previousSeenActivities = null

    this.sectionIndices = {}

    //  Local storage course data
    const localStorage =
      testLocalStorage ?? ((await chrome.storage.local.get()) as ExtensionStorage)
    const { options, courseData } = localStorage

    this.options = options

    if (courseData[this.link]) {
      // Course exists in locally stored data
      this.isFirstScan = false
      const storedCourseData = courseData[this.link]
      logger.debug(storedCourseData, "Course was found in local storage")

      this.previousSeenResources = storedCourseData.seenResources
      this.previousSeenActivities = storedCourseData.seenActivities
      this.lastModifiedHeaders = storedCourseData.lastModifiedHeaders
    } else {
      logger.debug(`New course detected ${this.name}`)
    }

    const mainHTML = this.HTMLDocument.querySelector("#region-main")

    if (!mainHTML) {
      return
    }

    if (this.link.match(assignmentURLRegex)) {
      await this.addCurrentAssignmentPage()
      logger.debug("Assignment page scan finished", { course: this })
    } else {
      if (parser.isTilesFormat(this.HTMLDocument)) {
        await this.processTiles(mainHTML as HTMLElement)
      }

      const modules = mainHTML.querySelectorAll<HTMLElement>("li[id^='module-']")
      if (modules && modules.length !== 0) {
        for (const node of Array.from(modules)) {
          const isFile = node.classList.contains("resource")
          const isFolder = node.classList.contains("folder")
          const isURL = node.classList.contains("url")

          if (isFile) {
            await this.addFile(node)
          } else if (isFolder) {
            await this.addFolder(node)
          } else if (isURL) {
            await this.addURLNode(node)
          } else {
            await this.addActivity(node)
          }
        }

        // Check for pluginfiles that could be anywhere on the page
        const pluginFileNodes = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("pluginfile", this.options))
        )
        const mediaFileNodes = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("media", this.options))
        )
        await Promise.all(pluginFileNodes.map((n) => this.addPluginFile(n)))
        await Promise.all(mediaFileNodes.map((n) => this.addPluginFile(n)))
      } else {
        // Backup solution that is a little more brute force
        const fileNodes = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("file", this.options))
        )
        const pluginFileNodes = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("pluginfile", this.options))
        )
        const urlFileNodes = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("url", this.options))
        )
        const mediaFileNodes = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("media", this.options))
        )
        const folderNodes = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("folder", this.options))
        )
        const activities = Array.from(
          mainHTML.querySelectorAll<HTMLElement>(parser.getQuerySelector("activity", this.options))
        )

        await Promise.all(fileNodes.map((n) => this.addFile(n)))
        await Promise.all(pluginFileNodes.map((n) => this.addPluginFile(n)))
        await Promise.all(urlFileNodes.map((n) => this.addURLNode(n)))
        await Promise.all(mediaFileNodes.map((n) => this.addPluginFile(n)))
        await Promise.all(folderNodes.map((n) => this.addFolder(n)))
        await Promise.all(activities.map((n) => this.addActivity(n)))
      }

      logger.debug("Course scan finished", { course: this })
    }

    // Scan sidebar for video block links (outside #region-main)
    this.addSidebarVideos()

    if (testLocalStorage) {
      return
    }

    // Deduplicate resources before saving, as injected tile fragments might be matched 
    // multiple times across different fallback queries (e.g file vs pluginfile nodes)
    const uniqueResourcesMap = new Map<string, Resource>()
    for (const res of this.resources) {
      if (!uniqueResourcesMap.has(res.href)) {
        uniqueResourcesMap.set(res.href, res)
      }
    }
    this.resources = Array.from(uniqueResourcesMap.values())

    if (this.lastModifiedHeaders === undefined) {
      this.lastModifiedHeaders = Object.fromEntries(
        this.resources.map((r) => [r.href, r.lastModified])
      )
    }

    const updatedCourseData = this.createCourseDataSnapshot()
    courseData[this.link] = updatedCourseData

    logger.debug(`Storing course data in local storage for course ${this.name}`, {
      updatedCourseData,
    })
    await chrome.storage.local.set({ courseData } satisfies Partial<ExtensionStorage>)
  }

  async updateStoredResources(downloadedResources?: Resource[]): Promise<CourseData> {
    const { courseData } = (await chrome.storage.local.get("courseData")) as ExtensionStorage
    const storedCourseData = courseData[this.link] ?? this.createCourseDataSnapshot()
    const { seenResources, lastModifiedHeaders } = storedCourseData

    const newResources = this.resources.filter((n) => n.isNew)

    // Default behavior: Merge all stored new resources
    let toBeMerged = newResources

    // If downloaded resources are provided then only merge those
    if (downloadedResources) {
      toBeMerged = downloadedResources
    }

    // Merge already seen resources with new resources
    // Use set to remove duplicates
    logger.debug(toBeMerged, "Adding resources to list of seen resources")
    const updatedSeenResources = Array.from(
      new Set(seenResources.concat(toBeMerged.map((r) => r.href)))
    )

    const updatedNewResources = newResources
      .filter((r) => !updatedSeenResources.includes(r.href))
      .map((r) => r.href)

    if (lastModifiedHeaders) {
      const toBeUpdated = toBeMerged

      if (downloadedResources === undefined) {
        const updatedResources = this.resources.filter((n) => n.isUpdated)
        toBeUpdated.push(...updatedResources)
      }

      toBeUpdated.forEach((r) => {
        lastModifiedHeaders[r.href] = r.lastModified
        r.isNew = false
        r.isUpdated = false
      })
    }

    const updatedCourseData = {
      ...(storedCourseData as CourseData),
      seenResources: updatedSeenResources,
      newResources: updatedNewResources,
      lastModifiedHeaders,
    } satisfies CourseData

    logger.debug(updatedCourseData, "Storing updated course data in local storage")
    await chrome.storage.local.set({
      courseData: {
        ...courseData,
        [this.link]: updatedCourseData,
      },
    } satisfies Partial<ExtensionStorage>)

    return updatedCourseData
  }

  async updateStoredActivities(): Promise<CourseData> {
    const { courseData } = (await chrome.storage.local.get("courseData")) as ExtensionStorage
    const storedCourseData = courseData[this.link] ?? this.createCourseDataSnapshot()

    const { seenActivities, newActivities } = storedCourseData
    logger.debug(newActivities, "Adding activities to list of seen activities")
    const updatedSeenActivities = Array.from(new Set(seenActivities.concat(newActivities)))
    const updatedNewActivities: string[] = []

    const updatedCourseData = {
      ...(storedCourseData as CourseData),
      seenActivities: updatedSeenActivities,
      newActivities: updatedNewActivities,
    } satisfies CourseData

    await chrome.storage.local.set({
      courseData: {
        ...courseData,
        [this.link]: updatedCourseData,
      },
    } satisfies Partial<ExtensionStorage>)

    return updatedCourseData
  }

  getNumberOfUpdates(): number {
    return [...this.resources, ...this.activities].filter((r) => r.isNew || r.isUpdated).length
  }

  private async processTiles(mainHTML: HTMLElement): Promise<void> {
    const tiles = mainHTML.querySelectorAll<HTMLElement>("a.tile-link")
    if (tiles.length === 0) return

    logger.debug(`Processing ${tiles.length} tiles for dynamic content via AJAX`)

    const sesskey = this.getSesskey()
    const contextId = this.getContextId()

    if (!sesskey || !contextId) {
      logger.warn("Could not find sesskey or contextid, falling back to visual clicks")
      for (const tile of Array.from(tiles)) {
        tile.click()
        await new Promise((r) => setTimeout(r, 500))
      }
      return
    }

    const hiddenContainer = this.HTMLDocument.createElement("div")
    hiddenContainer.style.display = "none"
    mainHTML.appendChild(hiddenContainer)

    await Promise.all(Array.from(tiles).map(async (tile) => {
      const sectionId = new URL((tile as HTMLAnchorElement).href).searchParams.get("id")
      if (!sectionId) return
      try {
        const content = await this.fetchTileContent(sectionId, sesskey, contextId)
        if (!content) return
        const wrapper = this.HTMLDocument.createElement("div")
        wrapper.id = `section-${sectionId}`
        const title = (tile.closest(".tile") || tile).querySelector("h3")?.textContent?.trim() || `Section ${sectionId}`
        wrapper.setAttribute("aria-label", title)
        wrapper.innerHTML = content
        hiddenContainer.appendChild(wrapper)
      } catch (e) {
        logger.error(`Failed to fetch tile content for section ${sectionId}`, e)
      }
    }))
  }

  private getScriptContent(): string {
    return Array.from(this.HTMLDocument.scripts).map((s) => s.textContent).join(" ")
  }

  private getSesskey(): string | undefined {
    const match = this.getScriptContent().match(/"sesskey":"([^"]+)"/)
    if (match) return match[1]
    const logoutLink = this.HTMLDocument.querySelector<HTMLAnchorElement>('a[href*="login/logout.php?sesskey="]')
    return logoutLink ? new URL(logoutLink.href).searchParams.get("sesskey") ?? undefined : undefined
  }

  private getContextId(): string | undefined {
    const match = this.getScriptContent().match(/"contextid":(\d+)/)
    if (match) return match[1]
    return this.HTMLDocument.body.className.match(/context-(\d+)/)?.[1]
  }

  private async fetchTileContent(sectionId: string, sesskey: string, contextId: string): Promise<string | undefined> {
    const baseURL = getMoodleBaseURL(this.link)
    const response = await fetch(`${baseURL}/lib/ajax/service.php?sesskey=${sesskey}&info=core_get_fragment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        index: 0,
        methodname: "core_get_fragment",
        args: {
          component: "format_tiles",
          callback: "get_cm_list",
          contextid: parseInt(contextId),
          args: [{ name: "sectionid", value: parseInt(sectionId) }],
        },
      }]),
    })
    if (!response.ok) return undefined
    const data = await response.json()
    return data[0]?.data?.html
  }

}

export default Course
