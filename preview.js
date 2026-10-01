const image = document.querySelector("#image");
const status = document.querySelector("#status");
const downloadButton = document.querySelector("#download");
const copyButton = document.querySelector("#copy");
const deleteButton = document.querySelector("#delete");

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

    downloadButton.addEventListener("click", async () => {
      try {
        await chrome.downloads.download({
          url: objectUrl,
          filename: capture.filename.split("/").pop(),
          conflictAction: "uniquify"
        });
        status.textContent = "Download started.";
      } catch (error) {
        status.textContent = error.message || "Download failed.";
      }
    });

    deleteButton.addEventListener("click", async () => {
      try {
        await deleteCapture(id);
        URL.revokeObjectURL(objectUrl);
        image.removeAttribute("src");
        image.hidden = true;
        downloadButton.disabled = true;
        copyButton.disabled = true;
        deleteButton.disabled = true;
        status.textContent = "Screenshot deleted.";
      } catch (error) {
        status.textContent = error.message || "Could not delete screenshot.";
      }
    });

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        status.textContent = "Copied to clipboard.";
      } catch (error) {
        status.textContent = error.message || "Copy failed.";
      }
    });
  } catch (error) {
    status.textContent = error.message || "Screenshot could not be loaded.";
  }
}

loadPreview();
