document.querySelectorAll(".options-link").forEach((n) => {
  n.addEventListener("click", () => {
    chrome.runtime.openOptionsPage()
  })
})

const versionSpan = document.querySelector<HTMLSpanElement>("#version")
if (versionSpan) {
  versionSpan.textContent = `(v. ${chrome.runtime.getManifest().version})`
}

export {}
