import { ExtensionOptions } from "@types"

const defaultExtensionOptions: ExtensionOptions = {
  onlyNewResources: true,
  useMoodleFileName: true,
  showDownloadOptions: false,
  prependCourseShortcutToFileName: false,
  prependCourseNameToFileName: false,
  prependSectionToFileName: false,
  prependSectionIndexToFileName: false,
  prependFileIndexToFileName: false,
  prependLastModifiedToFileName: false,
  alwaysShowDetails: true,
  defaultMoodleURL: "",
  autoSetMoodleURL: true,
  backgroundScanInterval: 30,
  enableBackgroundScanning: true,
  downloadFolderAsZip: false,
  includeAssignmentSubmissionFiles: true,
  saveToMoodleFolder: true,
  folderStructure: "CourseSectionFile",
  includeVideo: true,
  includeAudio: true,
  includeImage: true,
  maxConcurrentDownloads: 100,
  maxCoursesOnDashboardPage: 100,
  detectFileUpdates: true,
  customSelectorCourseName: "",
  customSelectorCourseShortcut: "",
  customSelectorSectionElement: "",
  customSelectorSectionName: "",
}

export default defaultExtensionOptions
