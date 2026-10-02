# Contributing to Pagebit

Thanks for helping improve Pagebit. For a bug, open an issue with the Chrome version, the capture mode, steps to reproduce it, and the expected and actual result. Remove private information from screenshots before attaching them.

For a change, open an issue first if it would alter permissions, data handling, or the user experience. Small fixes can go straight to a pull request.

## Local setup

1. Install Node.js 24 and Python 3.
2. Run `npm ci`.
3. Run `npx playwright install chromium` to install the browser used by the tests.
4. Run `npm test`.
5. Load this directory as an unpacked extension from `chrome://extensions` to try changes in Chrome.

The extension has no build step. Its JavaScript, HTML, CSS, manifest, and icons are loaded directly by Chrome. Keep permission requests narrow and update the privacy policy in `site/privacy/index.html` when data handling changes.

Pull requests should explain the behavior change, include a way to reproduce or verify it, and pass the tests. Please keep unrelated changes out of the same pull request.
