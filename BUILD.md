# Build Instructions (Mozilla Add-on Review)

## Environment

- **Node.js**: 20 or later (tested on Node 20 LTS)
- **npm**: included with Node.js
- **OS**: Linux / macOS / Windows (WSL)

The default Mozilla review environment (Ubuntu 24.04, Node 24, npm 11) works without changes.

## Steps

```bash
# 1. Enter the extension directory
cd extension

# 2. Install dependencies
npm install

# 3. Build the Firefox extension
NODE_ENV=production TARGET=firefox npx webpack
```

The compiled add-on is output to **`extension/build/`**.

## Verifying the build

After running the build, the contents of `extension/build/` should match the submitted `.zip` file exactly (same files, same structure).

To create the zip yourself for comparison:

```bash
cd extension/build
find . -type f | zip "../../moodle-buddy-plus-firefox.zip" -@
```

## Notes

- `TARGET=firefox` omits the `offscreen` permission and uses a background `scripts` array instead of a service worker (required for Firefox MV3).
- No remote code is fetched at build or runtime. All dependencies are bundled via webpack.
- `package-lock.json` is included to pin all dependency versions.
