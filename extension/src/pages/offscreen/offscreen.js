chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "zoom-download") return
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== "fetch-and-blob") return
    try {
      const resp = await fetch(msg.url)
      if (!resp.ok) {
        port.postMessage({ error: `HTTP ${resp.status} ${resp.statusText}` })
        return
      }
      const blob = await resp.blob()
      port.postMessage({ blobUrl: URL.createObjectURL(blob), size: blob.size })
    } catch (e) {
      port.postMessage({ error: String(e?.message || e) })
    }
  })
})
