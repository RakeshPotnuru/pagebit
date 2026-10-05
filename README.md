# Pagebit

Pagebit is a Chrome extension for capturing a selected area, a selected element, the visible area, or a full web page as a PNG.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/imfnpdoblfnacegdlnamflmelmeanoon)

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Select **Load unpacked** and choose this folder.
4. Pin Pagebit, open a web page, and click its toolbar button.

Each capture opens in a new tab with a fitted preview. Use Download to save the PNG in `Downloads`, Copy to put it on the clipboard, or Delete to discard it. Pagebit removes its stored PNG when the preview tab closes. On each new capture it removes stored screenshots older than 24 hours and keeps at most 20 files or 100 MB. Downloads and clipboard copies remain under your control. Captures stay on your computer. Pagebit hides page scrollbars during capture and restores them afterward.

Choose Selected area and drag a rectangle on the visible page. Release to open its PNG preview. Click the extension icon again to cancel selection.

## Permissions

- `activeTab` and `scripting` let Pagebit select elements and capture the active page after you click the toolbar button.
- `downloads` saves PNG files when you choose Download.
- `clipboardWrite` copies a PNG when you choose Copy.

Element selection works in the main document. Tall elements and full pages are captured in sections, waiting for visible images and animations before stitching the PNG. Keep the tab active until capture finishes. The toolbar badge shows progress. Click the extension icon again to exit selection or stop a capture. Pagebit restores the original page and nested scroll positions. Elements already fully visible, including dialogs, are captured without scrolling. Elements inside ordinary scrolling containers can be captured across their scrollable area. Complex clipping layouts and cross-origin frames remain limited. Scroll-linked animations are captured at each viewport position, so their poses and seams can differ from a static page. Chrome restricts script injection on some internal pages, including `chrome://extensions`.

## Package an update

Run `bash release.sh` in a terminal and choose `1` for major, `2` for minor, or `3` for patch at the prompt. It updates `manifest.json` and writes `release/pagebit-<version>.zip` with only the extension files. To package the current version without changing it, run `python3 package.py`. Upload the ZIP as the new package in the Chrome Web Store dashboard.

## Contribute

Pagebit uses plain JavaScript, HTML, and CSS. It has no build step. To work on it, install Node.js 24, run `npm ci` and `npx playwright install chromium`, then run `npm test`. The browser tests launch a temporary copy of the extension. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Report bugs and request features in [GitHub issues](https://github.com/RakeshPotnuru/pagebit/issues). For a vulnerability, follow [SECURITY.md](SECURITY.md). The [privacy policy](https://pagebit.publishstudio.one/privacy/) explains what the extension stores on your device.

## License

Pagebit is available under the [MIT License](LICENSE).
