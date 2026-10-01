# Pagebit

Pagebit is a Chrome extension for capturing a selected element, the visible area, or a full web page as a PNG.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Select **Load unpacked** and choose this folder.
4. Pin Pagebit, open a web page, and click its toolbar button.

Each capture opens in a new tab with a fitted preview. Use Download to save the PNG in `Downloads`, Copy to put it on the clipboard, or Delete to discard it. Pagebit removes its stored PNG when the preview tab closes. On each new capture it removes stored screenshots older than 24 hours and keeps at most 20 files or 100 MB. Downloads and clipboard copies remain under your control. Captures stay on your computer. Pagebit hides page scrollbars during capture and restores them afterward.

## Permissions

- `activeTab` and `scripting` let Pagebit select elements and capture the active page after you click the toolbar button.
- `downloads` saves PNG files when you choose Download.
- `clipboardWrite` copies a PNG when you choose Copy.

Element selection works in the main document. Tall elements and full pages are captured in sections, waiting for visible images and animations before stitching the PNG. Keep the tab active until capture finishes. The toolbar badge shows progress. Click the extension icon again to exit selection or stop a capture. Pagebit restores the original page and nested scroll positions. Elements already fully visible, including dialogs, are captured without scrolling. Elements inside ordinary scrolling containers can be captured across their scrollable area. Complex clipping layouts and cross-origin frames remain limited. Scroll-linked animations are captured at each viewport position, so their poses and seams can differ from a static page. Chrome restricts script injection on some internal pages, including `chrome://extensions`.
