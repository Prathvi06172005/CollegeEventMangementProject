(function () {
  if (window.__studentNotificationsInitialized) return;
  window.__studentNotificationsInitialized = true;

  const POLL_INTERVAL = 20000;
  let lastCheck = new Date().toISOString();
  let stack;

  function init() {
    if (!document.body || typeof fetch !== 'function') return;
    stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    pollNotifications();
    setInterval(pollNotifications, POLL_INTERVAL);
  }

  async function pollNotifications() {
    try {
      const res = await fetch(`/student/notifications/latest?since=${encodeURIComponent(lastCheck)}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = await res.json();
      const notifications = Array.isArray(data.notifications) ? data.notifications : [];
      if (!notifications.length) return;
      lastCheck = new Date().toISOString();
      notifications.forEach(showToast);
    } catch (_) {
      // ignore network errors
    }
  }

  function showToast(notification) {
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const message = escapeHtml(notification.message || 'New notification');
    toast.innerHTML = `
      <div class="toast-title">New Event</div>
      <div class="toast-body">${message}</div>
      <div class="toast-time">${formatRelative(notification.created_at)}</div>
    `;
    toast.addEventListener('click', () => {
      window.location.href = '/student';
      dismissToast(toast);
    });
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => dismissToast(toast), 8000);
  }

  function dismissToast(toast) {
    if (!toast) return;
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatRelative(timestamp) {
    const date = timestamp ? new Date(timestamp) : new Date();
    const diff = Date.now() - date.getTime();
    if (Number.isNaN(diff)) return '';
    const mins = Math.round(diff / 60000);
    if (mins <= 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    return date.toLocaleString();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();



