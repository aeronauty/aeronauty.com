// Dashboard Home Button — injected on every page
// Navigates back to the dashboard when tapped.
// Hidden when already on the dashboard.

(function () {
  // Configure your dashboard URL here
  const DASHBOARD_URL = "DASHBOARD_URL_PLACEHOLDER";

  // Don't show on the dashboard itself
  if (window.location.href.startsWith(DASHBOARD_URL)) return;

  // Create the button
  const btn = document.createElement("button");
  btn.id = "dashboard-home-btn";
  btn.title = "Back to Dashboard";
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

  btn.addEventListener("click", function () {
    window.location.href = DASHBOARD_URL;
  });

  // Wait for body
  if (document.body) {
    document.body.appendChild(btn);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.appendChild(btn);
    });
  }
})();
