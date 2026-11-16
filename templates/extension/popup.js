// An explicit, user-initiated permission request: nothing is read before this.
document.getElementById("grant").addEventListener("click", async () => {
  const status = document.getElementById("status");
  try {
    const ok = await chrome.permissions.request({ origins: ["https://listings.example-source.test/*"] });
    status.textContent = ok ? "Allowed. Search on example-app.com." : "Not allowed.";
  } catch (err) {
    status.textContent = "Could not ask for permission: " + err.message;
  }
});
