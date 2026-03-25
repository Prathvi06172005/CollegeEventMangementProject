const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

let db;

function getDb() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

async function initDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new sqlite3.Database(dbPath);

  await run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('organizer','student')),
      email TEXT,
      branch TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      google_form_url TEXT,
      event_type TEXT NOT NULL DEFAULT 'written' CHECK(event_type IN ('written','flier')),
      flier_path TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed')),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )`
  );

  // Ensure new event columns exist for flier support
  try {
    const eventCols = await all(`PRAGMA table_info(events)`);
    const hasCol = (name) => eventCols.some(c => c.name === name);
    if (!hasCol('event_type')) {
      await run(`ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'written'`);
    }
    if (!hasCol('flier_path')) {
      await run(`ALTER TABLE events ADD COLUMN flier_path TEXT`);
    }
    if (!hasCol('tags')) {
      await run(`ALTER TABLE events ADD COLUMN tags TEXT DEFAULT ''`);
    }
    if (!hasCol('audience_branches')) {
      await run(`ALTER TABLE events ADD COLUMN audience_branches TEXT DEFAULT 'all'`);
    }
  } catch (_) {}
  try {
    const userCols = await all(`PRAGMA table_info(users)`);
    const hasUserCol = (name) => userCols.some((c) => c.name === name);
    if (!hasUserCol('branch')) {
      await run(`ALTER TABLE users ADD COLUMN branch TEXT`);
    }
  } catch (_) {}

  await run(
    `CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, student_id),
      FOREIGN KEY(event_id) REFERENCES events(id),
      FOREIGN KEY(student_id) REFERENCES users(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      comments TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, student_id),
      FOREIGN KEY(event_id) REFERENCES events(id),
      FOREIGN KEY(student_id) REFERENCES users(id)
    )`
  );

  // Ensure new feedback columns exist for richer responses
  const cols = await all(`PRAGMA table_info(feedback)`);
  const has = name => cols.some(c => c.name === name);
  const addCol = async (name, type) => { await run(`ALTER TABLE feedback ADD COLUMN ${name} ${type}`); };
  if (!has('student_name')) { try { await addCol('student_name', 'TEXT'); } catch (_) {} }
  if (!has('branch')) { try { await addCol('branch', 'TEXT'); } catch (_) {} }
  if (!has('section')) { try { await addCol('section', 'TEXT'); } catch (_) {} }
  if (!has('suggestions')) { try { await addCol('suggestions', 'TEXT'); } catch (_) {} }
  if (!has('q_organization')) { try { await addCol('q_organization', 'INTEGER'); } catch (_) {} }
  if (!has('q_content')) { try { await addCol('q_content', 'INTEGER'); } catch (_) {} }
  if (!has('q_venue')) { try { await addCol('q_venue', 'INTEGER'); } catch (_) {} }
  if (!has('q_engagement')) { try { await addCol('q_engagement', 'INTEGER'); } catch (_) {} }
  // Text-based answers for questions
  if (!has('q_organization_text')) { try { await addCol('q_organization_text', 'TEXT'); } catch (_) {} }
  if (!has('q_content_text')) { try { await addCol('q_content_text', 'TEXT'); } catch (_) {} }
  if (!has('q_venue_text')) { try { await addCol('q_venue_text', 'TEXT'); } catch (_) {} }
  if (!has('q_engagement_text')) { try { await addCol('q_engagement_text', 'TEXT'); } catch (_) {} }

  await run(
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`
  );

  // Web Push subscriptions
  await run(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`
  );

  // Seed default users if they don't exist
  const organizerExists = await get(
    `SELECT id FROM users WHERE username = ?`,
    ['organizer']
  );
  if (!organizerExists) {
    const hash = await bcrypt.hash('organizer123', 10);
    await run(
      `INSERT INTO users (username, password_hash, role, email) VALUES (?,?,?,?)`,
      ['organizer', hash, 'organizer', 'organizer@example.com']
    );
  }

  for (let i = 1; i <= 3; i++) {
    const uname = `student${i}`;
    const exists = await get(`SELECT id FROM users WHERE username = ?`, [uname]);
    if (!exists) {
      const hash = await bcrypt.hash('student123', 10);
      await run(
        `INSERT INTO users (username, password_hash, role, email) VALUES (?,?,?,?)`,
        [uname, hash, 'student', `student${i}@example.com`]
      );
    }
  }
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

module.exports = { initDb, getDb, run, all, get };


