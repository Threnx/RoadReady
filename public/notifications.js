// FILE: public/notifications.js
console.log('notifications.js loaded!');

const socket = io();

// Listen for real-time notifications
socket.on('notification', data => {
  console.log('New real-time notification:', data);
  showToast(`Notification: ${data.message}`);
});

/**
 * Creates and shows a Bootstrap toast in the #toastContainer
 */
function showToast(message) {
  // 1) Create a unique ID for this toast
  const toastId = `toast-${Date.now()}`;

  // 2) Build the toast HTML
  const toastHTML = `
    <div id="${toastId}" class="toast align-items-center text-bg-primary border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;

  // 3) Append it to the container
  const container = document.getElementById('toastContainer');
  container.insertAdjacentHTML('beforeend', toastHTML);

  // 4) Select the newly added toast
  const toastEl = document.getElementById(toastId);
  // 5) Initialize it as a Bootstrap toast
  const bsToast = new bootstrap.Toast(toastEl, {
    delay: 5000  // auto-hide after 5 seconds
  });
  bsToast.show();

  // Optionally remove the element from DOM when hidden
  toastEl.addEventListener('hidden.bs.toast', () => {
    toastEl.remove();
  });
}
