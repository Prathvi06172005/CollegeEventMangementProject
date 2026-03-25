const express = require('express');
const webPush = require('web-push');
const { all, run } = require('../storage/db');

// VAPID key setup: prefer env; otherwise generate per process
let VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || null;
let VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || null;
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  const keys = webPush.generateVAPIDKeys();
  VAPID_PUBLIC = keys.publicKey;
  VAPID_PRIVATE = keys.privateKey;
}
webPush.setVapidDetails('mailto:admin@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

const router = express.Router();

router.get('/public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

router.post('/subscribe', async (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  try {
    await run(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
      [req.session.user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
  try {
    await run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

async function sendPushToUser(userId, payload) {
  const subs = await all(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`, [userId]);
  for (const s of subs) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err) {
      // Clean up gone subscriptions
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        try { await run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [s.endpoint]); } catch (_) {}
      }
    }
  }
}

module.exports = { router, sendPushToUser, VAPID_PUBLIC };
