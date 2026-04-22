# Moodle Buddy+

Mass file download and update notifications for Moodle. Pull every resource in a course with one click, get notified when new material appears, and keep everything organised on disk.

A maintained fork of the original Moodle Buddy, with bug fixes and additions for modern Moodle versions.

## Install

Available for **Chrome** and **Firefox**.

## Usage

1. Log into your university's Moodle.
2. Open one of:
   - the dashboard / course overview (URL ends in `/my`)
   - any course page (URL contains `/course`)
   - an activity page (e.g. `/mod/assign`)
   - the Moodle video service (URL contains `/videoservice`)
3. Click the Moodle Buddy+ icon in the browser toolbar.

## Features

### Course page

- One-click download of every resource in the course
- Detects new resources and activities (assignment uploads, forums, …) since your last visit
- Download only what's new, or filter by files / folders
- Configurable folder structure and file-name format

### Dashboard

- Scans every course on the overview page and surfaces updates per course
- Download a whole course (or just its new items) without leaving the dashboard
- Optional background scan that notifies you when courses change while you're logged in
- Group courses on disk by their dashboard category (FCL group)
- When two courses share the same name in the same group, the registrar's course number is appended so each gets its own folder

### Resources

- Folders are downloaded as a single zip per folder
- Moodle URL bookmarks are saved as `.txt` files containing the resolved external link

### Assignments & videos

- Download assignment submission files, graded files, and feedback comments
- Download Moodle video service recordings and embedded Zoom recordings

### Other

- Supports the Moodle Tiles course format

## Licensing

Released under the GNU Affero General Public License v3 (AGPL-3.0). **Read the [full license](LICENSE) before using.**

You must:

- Respect the copyright held by the maintainers
- Disclose any modifications and publish derivative code under the same license
- Attribute the original maintainers, especially in commercial use

You may not:

- Sublicense this codebase
- Expect any liability or warranty from the maintainers (feedback is still very welcome)

## For developers

All commands run inside the `extension` directory.

### Setup

```bash
npm install
```

### Development

In one terminal:

```bash
npm run dev          # webpack watch, Firefox build
# or
npm run dev:chrome   # webpack watch, Chrome build
```

In a second terminal:

```bash
npm start            # Firefox Nightly with the extension auto-loaded
# or
npm run start:ff     # regular Firefox
```

For Chrome, load `extension/build/` as an unpacked extension at `chrome://extensions` and click reload after each change.

### Debugging

- Firefox: open the **Browser Console** (`Ctrl + Shift + J`) and enable *Show Content Messages* from the cog menu so content-script logs appear.
- Chrome: inspect the popup, the options page, and the service worker from `chrome://extensions`.

### Build

```bash
npm run build:chrome
npm run build:ff
```

Production zips are written to `extension/moodle-buddy-plus-<target>.zip`.

## Issues

Bug reports and feature requests: <https://github.com/yarden-carmi/moodle-buddy-plus/issues>
