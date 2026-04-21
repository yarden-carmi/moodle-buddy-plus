import { options } from "../state"

export default function useNavigation() {
  const openURL = (url: string) => {
    chrome.tabs.create({ url })
    window.close()
  }
  const openContactPage = () => openURL("/pages/information/information.html#contact")
  const openInfoPage = () => {
    openURL("/pages/information/information.html")
  }
const openOptionsPage = () => {
    chrome.runtime.openOptionsPage()
  }
const openMoodlePage = () => {
    if (options.value === undefined) return

    openURL(options.value.defaultMoodleURL)
  }
  const openCoursePage = (url: string) => {
    openURL(url)
  }

  return {
    openURL,
    openContactPage,
    openInfoPage,
    openOptionsPage,
    openMoodlePage,
    openCoursePage,
  }
}
