import { ExtensionOptions } from "types"
import { getURLRegex } from "./regexHelpers"
import logger from "./logger"

export function checkForMoodle(): boolean {
  // Check for unique moodle DOM element
  const isMoodle = Boolean(document.querySelector("#region-main"))
  logger.debug({ isMoodle })
  return isMoodle
}

export function isTilesFormat(document: Document): boolean {
  return Boolean(document.querySelector("#format-tiles-multi-section-page"))
}

export function parseCourseShortcut(document: Document, options: ExtensionOptions): string {
  if (options.customSelectorCourseShortcut) {
    const customSelectorResult = document.querySelector(options.customSelectorCourseShortcut)
    if (customSelectorResult) {
      const textContent = customSelectorResult?.textContent?.trim()
      if (textContent) {
        return textContent
      }
    }
  }

  const shortcutNode = document.querySelector("a[aria-current='page']")
  if (shortcutNode) {
    const textContent = shortcutNode?.textContent?.trim()
    if (textContent) {
      return textContent
    }
  }

  const possibleNavbarContainers = document.querySelectorAll("#page, #page-header, #page-navbar")
  if (possibleNavbarContainers) {
    for (const container of Array.from(possibleNavbarContainers)) {
      const navbar = container.querySelector("nav, ol, ul")
      if (navbar) {
        const allNavElements = Array.from(navbar.querySelectorAll("li"))
        const lastNav = allNavElements.pop()
        if (lastNav) {
          const textContent = lastNav?.textContent?.trim()
          if (textContent) {
            return textContent
          }
        }
      }
    }
  }

  return "Unknown Shortcut"
}

export function parseCourseNameFromCoursePage(
  document: Document,
  options: ExtensionOptions
): string {
  if (options.customSelectorCourseName) {
    const customSelectorResult = document.querySelector(options.customSelectorCourseName)
    if (customSelectorResult) {
      const textContent = customSelectorResult?.textContent?.trim()
      if (textContent) {
        return textContent
      }
    }
  }

  const header = document.querySelector(".page-header-headings")
  if (header && header.children.length > 0) {
    const textContent = header.children[0]?.textContent?.trim()
    if (textContent) {
      return textContent
    }
  }

  const shortcutNode = document.querySelector<HTMLAnchorElement>("a[aria-current='page']")
  if (shortcutNode) {
    const title = shortcutNode?.title?.trim()
    if (title) {
      return title
    }

    const textContent = shortcutNode?.textContent?.trim()
    if (textContent) {
      return textContent
    }
  }

  const mainHTML = document.querySelector("#region-main")
  if (mainHTML) {
    const firstHeader = mainHTML.querySelector("h1")
    if (firstHeader) {
      const textContent = firstHeader?.textContent?.trim()
      if (textContent) {
        return textContent
      }
    }
  }

  const possibleTitleContainers = document.querySelectorAll("#page, #page-header, #page-navbar")
  if (possibleTitleContainers) {
    for (const container of Array.from(possibleTitleContainers)) {
      const titleElement = container.querySelector("h1")
      if (titleElement) {
        const textContent = titleElement?.textContent?.trim()
        if (textContent) {
          return textContent
        }
      }
    }
  }

  const shortcut = parseCourseShortcut(document, options)
  if (shortcut !== "" && shortcut !== "Unknown Shortcut") {
    return shortcut
  }

  return "Unknown Course"
}

export function parseCourseGroupFromCoursePage(document: Document, courseLink: string): string {
  const idMatch = courseLink.match(/[?&]id=(\d+)/)
  if (!idMatch) return ""
  const courseId = idMatch[1]

  const panels = document.querySelectorAll<HTMLElement>(
    ".block_filtered_course_list .block-fcl__list"
  )
  for (const panel of Array.from(panels)) {
    const hasSelfLink = Array.from(panel.querySelectorAll<HTMLAnchorElement>("a")).some((a) => {
      const m = a.getAttribute("href")?.match(/[?&]id=(\d+)/)
      return m?.[1] === courseId
    })
    if (!hasSelfLink) continue

    const tabId = panel.getAttribute("aria-labelledby")
    if (tabId) {
      const label = document.getElementById(tabId)?.textContent?.trim()
      if (label) return label
    }
  }
  return ""
}

export function parseCourseLink(htmlString: string): string {
  const courseURLRegex = getURLRegex("course")
  const match = htmlString.match(courseURLRegex)
  return match ? match[0] : htmlString
}

const ASSIGNMENT_NAME_SELECTORS = [
  ".page-header-headings h1", "#page-header h1", ".page-context-header h1",
  "#region-main h2", "#region-main h1", "h1",
]

export function parseAssignmentNameFromPage(document: Document): string {
  for (const sel of ASSIGNMENT_NAME_SELECTORS) {
    const text = document.querySelector(sel)?.textContent?.replace(/\s+/g, " ")?.trim()
    if (text) return text
  }
  return ""
}

function getBreadcrumbItems(document: Document): HTMLElement[] {
  const breadcrumb = document.querySelector(".breadcrumb, nav[aria-label] ol, [role='navigation'] ol")
  return breadcrumb ? Array.from(breadcrumb.querySelectorAll("li")) : []
}

function breadcrumbText(item: HTMLElement | undefined): string {
  return item?.textContent?.replace(/[\/]/g, "")?.replace(/\s+/g, " ")?.trim() || ""
}

export function parseCourseNameFromBreadcrumb(document: Document): string {
  const items = getBreadcrumbItems(document)
  const courseURLRegex = getURLRegex("course")
  const idx = items.findIndex((item) => item.querySelector("a")?.href.match(courseURLRegex))
  return idx !== -1 ? breadcrumbText(items[idx]) : ""
}

export function parseSectionFromBreadcrumb(document: Document): string {
  const items = getBreadcrumbItems(document)
  const courseURLRegex = getURLRegex("course")
  const idx = items.findIndex((item) => item.querySelector("a")?.href.match(courseURLRegex))
  if (idx !== -1 && idx < items.length - 2) return breadcrumbText(items[idx + 1])
  return ""
}

type QuerySelectorTypes =
  | "file"
  | "folder"
  | "pluginfile"
  | "url"
  | "activity"
  | "video"
  | "audio"
  | "image"
  | "media"
  | "videoservice"
export function getQuerySelector(type: QuerySelectorTypes, options: ExtensionOptions): string {
  const baseURL = ""
  const fileSelector = `[href*="${baseURL}/mod/resource"]`
  const folderSelector = `[href*="${baseURL}/mod/folder"]`
  const pluginFileSelector = `[href*="${baseURL}/pluginfile"]:not(.mediafallbacklink)`
  const urlSelector = `[href*="${baseURL}/mod/url"]`
  const videoSelector = `video source`
  const audioSelector = `audio source`
  const imageSelector = `img[src*="${baseURL}/pluginfile"]`
  const videoServiceSelector = `video[src*="${baseURL}/mod/videoservice/file.php"]`
  // Any link with /mod/xxx except /mod/resource and /mod/folder
  const activityQuerySelector = `[href*="${baseURL}/mod/"]:not(${fileSelector}):not(${folderSelector})`

  let selector = ""
  switch (type) {
    case "file":
      selector = fileSelector
      break
    case "folder":
      selector = folderSelector
      break
    case "pluginfile":
      selector = pluginFileSelector
      break
    case "url":
      selector = urlSelector
      break
    case "activity":
      selector = activityQuerySelector
      break
    case "video":
      selector = videoSelector
      break
    case "audio":
      selector = audioSelector
      break
    case "image":
      selector = imageSelector
      break
    case "media":
      const mediaSelectors: string[] = []
      if (options.includeVideo) {
        mediaSelectors.push(videoSelector)
      }
      if (options.includeAudio) {
        mediaSelectors.push(audioSelector)
      }
      if (options.includeImage) {
        mediaSelectors.push(imageSelector)
      }
      selector = mediaSelectors.join(",") || "pleasedontmatchanything"
      break
    case "videoservice":
      selector = videoServiceSelector
      break
    default:
      break
  }

  selector = `${selector}:not(.helplinkpopup)`
  return selector
}

export function parseURLFromNode(
  node: HTMLElement,
  type: QuerySelectorTypes,
  options: ExtensionOptions
): string {
  const aTag = node.querySelector<HTMLAnchorElement>(getQuerySelector(type, options))
  if (aTag) {
    return aTag.href
  }

  if (node.tagName === "A") {
    return (node as HTMLAnchorElement).href
  }

  if (type === "pluginfile") {
    // Videos are also pluginfiles but have a different selector
    const mediaTag = node.querySelector(getQuerySelector("media", options))
    const mediaTags = ["IMG", "VIDEO", "AUDIO"]
    if (mediaTags.includes(mediaTag?.tagName ?? "")) {
      return (mediaTag as HTMLSourceElement).src
    }

    if (mediaTags.includes(node?.tagName ?? "")) {
      return (node as HTMLSourceElement).src
    }
  }

  if (node.tagName === "SOURCE") {
    return (node as HTMLSourceElement).src
  }

  return ""
}

export function parseFileNameFromNode(node: HTMLElement): string {
  // Files or Folders
  let contentNode = node.querySelector(".instancename")
  if (contentNode) {
    const { firstChild } = contentNode
    if (firstChild) {
      const textContent = firstChild?.textContent?.trim()
      if (textContent) {
        return textContent
      }
    }
  }

  // PluginFiles
  contentNode = node.querySelector(".fp-filename")
  if (contentNode) {
    const textContent = contentNode?.textContent?.trim()
    if (textContent) {
      return textContent
    }
  }

  const textContent = node?.textContent?.trim()
  if (textContent) {
    return textContent
  }

  return "Unknown Filename"
}

export function parseFolderRelativePathFromPluginFileURL(url: string): string {
  // Moodle folder module pluginfile URLs look like:
  //   .../pluginfile.php/{contextid}/mod_folder/content/{revision}/{relative_path}
  // The relative path may include subfolder segments. Return them as "sub1/sub2/file.pdf"
  // (decoded). Returns "" if the URL is not a mod_folder pluginfile URL.
  const marker = "/mod_folder/content/"
  const idx = url.indexOf(marker)
  if (idx === -1) return ""
  const afterMarker = url.slice(idx + marker.length).split(/[#?]/)[0]
  const segments = afterMarker.split("/")
  // Drop the revision segment (first)
  segments.shift()
  if (segments.length === 0) return ""
  try {
    return segments.map((s) => decodeURIComponent(s)).join("/")
  } catch {
    return segments.join("/")
  }
}

export function parseFileNameFromPluginFileURL(url: string): string {
  let fileName = ""
  const urlParts = url.split("/")
  const lastUrlPart = urlParts.pop()
  if (lastUrlPart) {
    // Take everything before hash or query parameters
    const [path] = lastUrlPart.split(/[#?]/)
    fileName = path
  }

  fileName = decodeURIComponent(fileName)

  const specialCharacters: Record<string, string> = {
    "%21": "!",
    "%23": "#",
    "%24": "$",
    "%25": "%",
    "%26": "&",
    "%27": "'",
    "%28": "(",
    "%29": ")",
    "%2A": "*",
    "%2B": "+",
    "%2C": ",",
    "%2F": "/",
    "%3A": ":",
    "%3B": ";",
    "%3D": "=",
    "%3F": "?",
    "%40": "@",
    "%5B": "[",
    "%5D": "]",
  }

  for (const percentChar of Object.keys(specialCharacters)) {
    fileName = fileName.replace(percentChar, specialCharacters[percentChar])
  }

  return fileName
}

export function parseActivityNameFromNode(node: HTMLElement): string {
  const contentNode = node.querySelector(".instancename")
  if (contentNode) {
    const { firstChild } = contentNode
    if (firstChild) {
      const textContent = firstChild?.textContent?.trim()
      if (textContent) {
        return textContent
      }
    }
  }

  return "Unknown Activity"
}

export function parseActivityTypeFromNode(node: HTMLElement): string {
  const modtypeClass = Array.from(node.classList).find((className) => className.startsWith("modtype_"))
  if (modtypeClass) {
    const activityType = modtypeClass.replace(/^modtype_/, "").trim()
    if (activityType) {
      return activityType
    }
  }

  const contentNode = node.querySelector(".accesshide")
  if (contentNode) {
    const { firstChild } = contentNode
    if (firstChild) {
      const textContent = firstChild?.textContent?.trim()
      if (textContent) {
        return textContent
      }
    }
  }

  return "Unkown Activity Type"
}

function readSectionLabel(
  section: Element,
  document: Document,
  options: ExtensionOptions
): string {
  if (options.customSelectorSectionName) {
    const customSelectorResult = section.querySelector(options.customSelectorSectionName)
    const textContent = customSelectorResult?.textContent?.trim()
    if (textContent) return textContent
  }

  const ariaLabel = section.attributes.getNamedItem("aria-label")?.value?.trim()
  if (ariaLabel) return ariaLabel

  const ariaLabelledBy = section.attributes.getNamedItem("aria-labelledby")
  if (ariaLabelledBy) {
    const label = document.getElementById(ariaLabelledBy.value)
    const textContent = label?.textContent?.trim()
    if (textContent) return textContent
  }

  const sectionNameElement = section.querySelector(".sectionname")
  const sectionNameText = sectionNameElement?.textContent?.trim()
  if (sectionNameText) return sectionNameText

  const tileText = section.querySelector("h3")?.textContent?.trim()
  if (tileText) return tileText

  if (section.id === "section-0") return ""

  return "Unknown Section"
}

export function parseSectionName(
  node: HTMLElement,
  document: Document,
  options: ExtensionOptions
): string {
  const sectionSelector = options.customSelectorSectionElement || "[id^='section-']"
  const section = node.closest(sectionSelector)
  if (!section) {
    return ""
  }

  // Walk up through nested Moodle subsections, collecting ancestor section labels
  const labels: string[] = []
  let current: Element | null = section
  while (current) {
    const label = readSectionLabel(current, document, options)
    if (label) labels.unshift(label)
    current = current.parentElement?.closest(sectionSelector) ?? null
  }
  if (labels.length > 0) {
    return labels.join("{slash}")
  }

  return readSectionLabel(section, document, options) || "Unknown Section"
}

export function getDownloadButton(node: HTMLElement): HTMLFormElement | null {
  return node.querySelector<HTMLFormElement>(`form[action$="/mod/folder/download_folder.php"]`)
}

export function getDownloadIdTag(node: HTMLElement): HTMLInputElement | null {
  return node.querySelector<HTMLInputElement>("input[name='id']")
}
