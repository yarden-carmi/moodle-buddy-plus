export type ResourceTypes = FileResourceTypes | "folder" | "assignment" | "activity"
export type FileResourceTypes = "file" | "pluginfile" | "url" | "url-bookmark" | "videoservice" | "zoom" | "sidebar-video" | "embedded-video"

export interface Resource {
  href: string
  name: string
  section: string
  isNew: boolean
  isUpdated: boolean
  type: ResourceTypes
  partOfFolder?: string
  selected?: boolean // Only used on the frontend
  resourceIndex: number
  sectionIndex: number
  lastModified?: string
}

export interface FileResource extends Resource {
  type: FileResourceTypes
}

export interface VideoServiceResource extends Resource {
  type: "videoservice"
  src: string
}

export interface ZoomRecordingResource extends Resource {
  type: "zoom"
  zoomUrl: string
}

export interface SidebarVideoResource extends Resource {
  type: "sidebar-video"
}

export interface EmbeddedVideoResource extends Resource {
  type: "embedded-video"
}

export interface FolderResource extends Resource {
  type: "folder"
  isInline: boolean
}

export interface AssignmentResource extends Resource {
  type: "assignment"
}

export interface Activity extends Resource {
  type: "activity"
  activityType: string
}

export interface CourseData {
  seenResources: string[]
  newResources: string[]
  seenActivities: string[]
  newActivities: string[]
  lastModifiedHeaders?: Record<string, string | undefined>
}
