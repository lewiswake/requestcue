// This file is now very small! It acts as the "Traffic Cop"
const urlParams = new URLSearchParams(window.location.search);
let targetDjId = urlParams.get("d");
const pathname = window.location.pathname.replace(/^\/|\/$/g, '');

let isGuest = false;

if (targetDjId) {
  isGuest = true;
  targetDjId = "uid:" + targetDjId; // Marker for direct UID (legacy support)
} else if (pathname && pathname !== 'app' && pathname !== 'app/index.html' && pathname !== 'index.html') {
  isGuest = true;
  targetDjId = pathname; // This is the username
}

if (isGuest) {
  // --- Guest Mode ---
  const appView = document.getElementById("app-view");
  const guestView = document.getElementById("guest-view");

  if (appView) appView.hidden = true;
  if (guestView) guestView.hidden = false;

  import("./guest.js")
    .then((module) => {
      module.initGuestMode(targetDjId);
    })
    .catch((err) => {
      console.error("Guest Module Error:", err);
      const msg = document.getElementById("guestLoading");
      if (msg) {
        msg.innerHTML = `<span style="color: #ff453a;">Error loading app: ${err.message}</span><br><small>Check console for details.</small>`;
      }
    });
} else {
  // --- Dashboard Mode ---
  const appView = document.getElementById("app-view");
  const guestView = document.getElementById("guest-view");

  if (appView) appView.hidden = false;
  if (guestView) guestView.hidden = true;

  import("./dashboard.js")
    .then((module) => {
      module.initDashboardMode();
    })
    .catch((err) => {
      console.error("Dashboard Module Error:", err);
      document.body.innerHTML = `<div style="color: white; text-align: center; margin-top: 50px; font-family: sans-serif;">
        <h2>Error Loading Dashboard</h2>
        <p>${err.message}</p>
        <p><small>Please check the console and ensure all files are available.</small></p>
      </div>`;
    });
}
