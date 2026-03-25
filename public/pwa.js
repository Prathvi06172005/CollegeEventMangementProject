(function(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
  }
  
  // Push notifications subscription
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function arraysEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async function ensurePushButton() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'granted') return; // already allowed; subscription will happen below
    if (document.getElementById('enable-push-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'enable-push-btn';
    btn.textContent = 'Enable Notifications';
    btn.style.position = 'fixed';
    btn.style.left = '18px';
    btn.style.bottom = '18px';
    btn.style.zIndex = '10000';
    btn.style.padding = '12px 16px';
    btn.style.borderRadius = '12px';
    btn.style.border = '1px solid rgba(236, 72, 153, .3)';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = '700';
    btn.style.background = 'linear-gradient(180deg, #ffffff, #fafafa)';
    btn.style.color = '#ec4899';
    btn.addEventListener('click', async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { btn.remove(); return; }
        await subscribeForPush();
        btn.remove();
      } catch (e) { btn.remove(); }
    });
    document.body.appendChild(btn);
  }

  async function subscribeForPush() {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    // Fetch public VAPID key
    const res = await fetch('/push/public-key', { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    const key = json && json.key;
    if (!key) return;
    const serverKey = urlBase64ToUint8Array(key);

    if (subscription) {
      const existingKeyBuffer = subscription.options && subscription.options.applicationServerKey;
      if (existingKeyBuffer) {
        const existingKey = new Uint8Array(existingKeyBuffer);
        if (!arraysEqual(existingKey, serverKey)) {
          try { await subscription.unsubscribe(); } catch (_) {}
          subscription = null;
        }
      }
    }

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
    }

    const payload = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
    await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  (async function initPush(){
    try {
      await ensurePushButton();
      if (Notification.permission === 'granted') {
        await subscribeForPush();
      }
    } catch (e) {}
  })();
  // Show a visible Install button when available
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    ensureInstallButton();
  });

  function ensureInstallButton(){
    if (document.getElementById('install-app-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'install-app-btn';
    btn.textContent = 'Install App';
    btn.style.position = 'fixed';
    btn.style.right = '18px';
    btn.style.bottom = '18px';
    btn.style.zIndex = '10000';
    btn.style.padding = '12px 16px';
    btn.style.borderRadius = '12px';
    btn.style.border = '1px solid rgba(236, 72, 153, .3)';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = '700';
    btn.style.background = 'linear-gradient(180deg, #ffffff, #fafafa)';
    btn.style.color = '#ec4899';
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome) {
        // Hide button regardless of outcome
        btn.remove();
      }
      deferredPrompt = null;
    });
    document.body.appendChild(btn);
  }
})();


