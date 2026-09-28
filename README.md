# Pagebit

Pagebit is a Chrome extension for capturing a selected element, the visible area, or a full web page as a PNG.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Select **Load unpacked** and choose this folder.
4. Pin Pagebit, open a web page, and click its toolbar button.

Images are saved in `Downloads/Pagebit`. Captures stay on your computer.

## Permissions

- `activeTab` and `scripting` let Pagebit select an element after you click the toolbar button.
- `debugger` lets Pagebit capture a selected element or a full page, including content outside the viewport. Chrome may display a debugging notice during these captures.
- `downloads` saves PNG files.

Element selection works in the main document. Press Escape to cancel. Chrome restricts script injection on some internal pages, including `chrome://extensions`.
