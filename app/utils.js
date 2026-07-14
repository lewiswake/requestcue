export function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function msToTimeAgo(ms) {
  if (!ms) return "Unknown";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function customAlert(message, title = "Notification") {
  return new Promise((resolve) => {
    const dialog = document.getElementById("customDialog");
    const titleEl = document.getElementById("dialogTitle");
    const messageEl = document.getElementById("dialogMessage");
    const confirmBtn = document.getElementById("dialogConfirm");
    const cancelBtn = document.getElementById("dialogCancel");

    if (!dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      alert(message);
      resolve();
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Hide cancel button for alert
    cancelBtn.hidden = true;
    confirmBtn.textContent = "OK";

    dialog.hidden = false;

    const onConfirm = () => {
      dialog.hidden = true;
      confirmBtn.removeEventListener("click", onConfirm);
      resolve();
    };

    confirmBtn.addEventListener("click", onConfirm);
  });
}

export function customConfirm(message, title = "Confirm Action") {
  return new Promise((resolve) => {
    const dialog = document.getElementById("customDialog");
    const titleEl = document.getElementById("dialogTitle");
    const messageEl = document.getElementById("dialogMessage");
    const confirmBtn = document.getElementById("dialogConfirm");
    const cancelBtn = document.getElementById("dialogCancel");

    if (!dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve(confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Show cancel button for confirm
    cancelBtn.hidden = false;
    confirmBtn.textContent = "Yes";
    cancelBtn.textContent = "Cancel";

    dialog.hidden = false;

    const cleanup = () => {
      dialog.hidden = true;
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}
