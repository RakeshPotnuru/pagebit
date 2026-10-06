const image = document.querySelector("#image");
const status = document.querySelector("#status");
const downloadButton = document.querySelector("#download");
const copyButton = document.querySelector("#copy");
const deleteButton = document.querySelector("#delete");
const buttons = [downloadButton, copyButton, deleteButton];
const labels = new Map(buttons.map(button => [button, button.textContent]));
const feedbackTimers = new Map();
let deleted = false;

async function runAction(button, pending, success, failure, action) {
  clearTimeout(feedbackTimers.get(button));
  buttons.forEach(item => { item.disabled = true; });
  button.textContent = pending;
  button.dataset.feedback = "pending";
  button.setAttribute("aria-busy", "true");
  try {
    await action();
    button.textContent = success;
    button.dataset.feedback = "success";
  } catch (error) {
    button.textContent = "Try again";
    button.dataset.feedback = "error";
    status.textContent = error.message || failure;
  } finally {
    button.removeAttribute("aria-busy");
    buttons.forEach(item => { item.disabled = deleted; });
    if (!deleted) {
      feedbackTimers.set(button, setTimeout(() => {
        button.textContent = labels.get(button);
        delete button.dataset.feedback;
        feedbackTimers.delete(button);
      }, 2500));
    }
  }
}

async function loadPreview() {
  try {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) throw new Error("Screenshot not found.");
    const capture = await getCapture(id);
    if (!capture) throw new Error("Screenshot not found.");
    const blob = capture.blob || await fetch(capture.dataUrl).then((response) => response.blob());
    const objectUrl = URL.createObjectURL(blob);

    image.src = objectUrl;
    await image.decode();
    image.hidden = false;
    status.textContent = capture.partial ? "Screenshot preview (visible part of selected element)" : "Screenshot preview";
    downloadButton.disabled = false;
    copyButton.disabled = false;
    deleteButton.disabled = false;

    downloadButton.addEventListener("click", () =>
      runAction(downloadButton, "Starting...", "Started", "Download failed.", async () => {
        await chrome.downloads.download({
          url: objectUrl,
          filename: capture.filename.split(/[\\/]/).pop(),
          saveAs: true,
          conflictAction: "uniquify"
        });
        status.textContent = "Download started.";
      })
    );

    deleteButton.addEventListener("click", () =>
      runAction(deleteButton, "Deleting...", "Deleted", "Could not delete screenshot.", async () => {
        await deleteCapture(id);
        deleted = true;
        URL.revokeObjectURL(objectUrl);
        image.removeAttribute("src");
        image.hidden = true;
        status.textContent = "Screenshot deleted.";
      })
    );

    copyButton.addEventListener("click", () =>
      runAction(copyButton, "Copying...", "Copied", "Copy failed.", async () => {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        status.textContent = "Copied to clipboard.";
      })
    );
  } catch (error) {
    status.textContent = error.message || "Screenshot could not be loaded.";
  }
}

loadPreview();
