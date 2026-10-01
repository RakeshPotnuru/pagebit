# Pagebit Chrome Web Store listing

Prepared for version 0.1.0. Paste these fields into the developer dashboard and review them against the final upload.

## Store listing

**Name:** Pagebit

**Short description:** Capture an element, the visible area, or a full web page as a PNG.

**Detailed description:**

Pagebit lets you capture the part of a web page you need and opens the result in a new tab.

- Select an element to capture it on its own.
- Capture the visible area of the current tab.
- Capture a full page beyond the visible window.
- Preview the PNG, then download, copy, or delete it.

Screenshots are processed and stored locally in Chrome. Pagebit does not upload them to its servers. Close the preview tab or click Delete to remove Pagebit's stored copy. Downloads and clipboard copies remain under your control.

Some browser pages cannot be captured. Full-page results on sites with scroll-linked animation or complex layouts may have seams.

**Category:** Productivity

**Language:** English

**Website:** https://pagebit.publishstudio.one/

**Privacy policy:** https://pagebit.publishstudio.one/privacy/

**Support:** support@publishstudio.one

## Privacy practices

**Single purpose:** Capture a selected element, the visible area, or a full web page as a PNG that the user can preview, download, or copy.

**Permission justifications:**

| Permission | Dashboard explanation |
| --- | --- |
| `activeTab` | Access the current tab after the user opens Pagebit from the toolbar so the requested screenshot can be captured. |
| `scripting` | Run the element picker and capture helper on the current page. For tall captures, temporarily scroll the page and hide scrollbars, then restore the page state. |
| `downloads` | Save a PNG when the user clicks Download in the preview tab. |
| `clipboardWrite` | Copy a PNG when the user clicks Copy in the preview tab. |

**Remote code:** None. All extension JavaScript is included in the ZIP.

**Data handling summary:** Page content, screenshot pixels, page title for the filename, capture time, and a preview-tab reference are handled locally to provide the requested capture. Captures are stored in extension IndexedDB for the preview. Closing the preview or clicking Delete removes the stored copy. Age, count, and size pruning also runs on the next save. The extension has no accounts, analytics, advertising, or screenshot upload. Review the exact dashboard questions before selecting responses and keep them consistent with the privacy policy.

**Data usage checkboxes for version 0.1.0:** Select **Website content** because Pagebit captures page pixels. Also select **Web history** because each locally stored capture includes the page title and capture time, forming a temporary record of pages the user chose to capture. Leave the other categories unchecked based on the current implementation. Pagebit does not separately extract or track personal information, health, payments, credentials, communications, location, or user activity. Screenshot pixels can incidentally contain such information, but they are handled as website content. Local-only processing still needs disclosure.

## Reviewer notes

Open a regular web page and click the Pagebit toolbar icon. Choose Select element and click an element, or choose Visible area or Full page. A preview opens in a new tab with Download, Copy, and Delete controls. Restricted browser pages do not permit capture. Full-page capture scrolls through the page and may show seams on scroll-animated sites. No account or sign-in is required.

## Image files

- `screenshots/01-capture-options.png`: current popup controls over the Pagebit landing page.
- `screenshots/02-preview.png`: current preview tab after a visible-area capture of the Pagebit landing page.
- `promo-440x280.png`: small promotional tile.
- `../icons/icon-128.png`: store icon.

The popup screenshot places a capture of the real extension popup over a capture of the Pagebit website to represent the toolbar experience. The preview screenshot comes from a live extension capture. No personal data is shown.
