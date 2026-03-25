const cron = require('node-cron');
const { all, run } = require('../storage/db');
const { sendPushToUser } = require('../web/push');

function startReminderJobs() {
  // Every day at 9 AM server time
  cron.schedule('0 9 * * *', async () => {
    try {
      const upcoming = await all(
        `SELECT id, title, event_date FROM events WHERE status='scheduled' AND date(event_date) >= date('now') AND date(event_date) <= date('now','+3 day')`
      );
      if (upcoming.length === 0) return;
      const students = await all(`SELECT id FROM users WHERE role='student'`);
      for (const e of upcoming) {
        for (const s of students) {
          await run(
            `INSERT INTO notifications (user_id, message) VALUES (?, ?)`,
            [s.id, `Reminder: Event '${e.title}' is on ${e.event_date}. Register if not yet!`]
          );
          try { await sendPushToUser(s.id, { title: 'Upcoming Event', body: `${e.title} on ${e.event_date}`, url: '/student' }); } catch (_) {}
        }
      }
    } catch (err) {
      // Swallow errors to keep job alive
    }
  });

  // Participation reminder on event day at 8 AM
  cron.schedule('0 8 * * *', async () => {
    try {
      const today = await all(`SELECT id, title FROM events WHERE status='scheduled' AND date(event_date) = date('now')`);
      for (const e of today) {
        const regs = await all(`SELECT student_id FROM registrations WHERE event_id=?`, [e.id]);
        for (const r of regs) {
          await run(
            `INSERT INTO notifications (user_id, message) VALUES (?, ?)`,
            [r.student_id, `Today is the event: '${e.title}'. See you there!`]
          );
          try { await sendPushToUser(r.student_id, { title: 'Today: Event', body: `${e.title} is today.`, url: '/student' }); } catch (_) {}
        }
      }
    } catch (err) {}
  });
}

module.exports = { startReminderJobs };


