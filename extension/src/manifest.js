const pkg = require("../package.json")

const BACKGROUND_SCRIPT = "background.js"

const firefoxProperties = {
  browser_specific_settings: {
    gecko: {
      id: "{d8623073-e6a7-441d-9140-c25813135e05}",
      data_collection_permissions: {
        required: ["none"],
      },
    },
  },
  background: {
    scripts: [BACKGROUND_SCRIPT],
  },
}

const chromeProperties = {
  browser_specific_settings: {
    gecko: {
      id: "moodlebuddy+@yarden-carmi",
    },
  },
  background: {
    service_worker: BACKGROUND_SCRIPT,
  },
}

function getBrowserSpecificProperties(target) {
  switch (target) {
    case "firefox":
      return firefoxProperties
    case "chrome":
      return chromeProperties
    default:
      throw new Error(`Unknown target: ${target}`)
  }
}

function getManifest() {
  const { TARGET } = process.env
  console.log(`\n\nCreating manifest.json for target=${TARGET}`)

  const manifest = {
    manifest_version: 3,
    name: pkg.displayName,
    version: pkg.version,
    description: pkg.description,
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    action: {
      default_icon: {
        16: "icons/16-gray.png",
        32: "icons/32-gray.png",
        48: "icons/48-gray.png",
        128: "icons/128-gray.png",
      },
      default_title: pkg.displayName,
      default_popup: "popup/index.html",
    },
    host_permissions: ["<all_urls>"],
    permissions: [
      "activeTab",
      "declarativeNetRequest",
      "downloads",
      ...(TARGET !== "firefox" ? ["offscreen"] : []),
      "storage",
      "scripting",
      "tabs",
    ],
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content-scripts/index.js"],
      },
    ],
    options_ui: {
      page: "pages/options/options.html",
      open_in_tab: true,
    },
    ...getBrowserSpecificProperties(TARGET),
  }

  const manifestString = JSON.stringify(manifest, null, 2)
  console.log("Created the following manifest:\n\n" + manifestString + "\n\n")
  return manifest
}

module.exports = getManifest
