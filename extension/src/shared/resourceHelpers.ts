import { Resource } from "@types"

export function isFile(resource: Resource) {
  return ["file", "pluginfile", "url"].includes(resource.type)
}

export function isZoomRecording(resource: Resource) {
  return resource.type === "zoom"
}

export function isVideoServiceVideo(resource: Resource) {
  return resource.type === "videoservice"
}

export function isSidebarVideo(resource: Resource) {
  return resource.type === "sidebar-video"
}

export function isEmbeddedVideo(resource: Resource) {
  return resource.type === "embedded-video"
}

export function isFolder(resource: Resource) {
  return resource.type === "folder"
}

export function isAssignment(resource: Resource) {
  return resource.type === "assignment"
}

export function isActivity(resource: Resource) {
  return resource.type === "activity"
}

export function isDownloadableResource(resource: Resource) {
  return !isActivity(resource)
}

export interface ResourceCategoryConfig {
  key: string
  label: string
  displayName: string
  filter: (r: Resource) => boolean
  alwaysShow?: boolean
}

export const RESOURCE_CATEGORIES: ResourceCategoryConfig[] = [
  { key: "file", label: "file(s) (PDF, etc.)", displayName: "Files", filter: isFile, alwaysShow: true },
  { key: "folder", label: "folder(s)", displayName: "Folders", filter: (r) => isFolder(r) || isAssignment(r), alwaysShow: true },
  { key: "zoom", label: "Zoom recording(s)", displayName: "Zoom Recordings", filter: isZoomRecording },
  { key: "sidebarVideo", label: "sidebar video(s)", displayName: "Sidebar Videos", filter: isSidebarVideo },
  { key: "embeddedVideo", label: "embedded video(s)", displayName: "Embedded Videos", filter: isEmbeddedVideo },
]

export function setResourceSelected(resources: Resource[], href: string, value: boolean) {
  const resource = resources.find((r) => r.href === href)
  if (resource) {
    resource.selected = value
  }
}
