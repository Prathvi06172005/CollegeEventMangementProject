const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { all, get, run } = require('../storage/db');
const { sendPushToUser } = require('./push');
const { EVENT_TAGS, AUDIENCE_BRANCHES, BRANCHES } = require('../constants/catalog');
const { POSTER_THEMES, generatePosterImage } = require('../services/posterGenerator');

const TAG_VALUES = EVENT_TAGS.map((t) => t.value);
const AUDIENCE_VALUES = AUDIENCE_BRANCHES.map((b) => b.value);
const BRANCH_VALUES = BRANCHES.map((b) => b.value);
const TAG_LABELS = EVENT_TAGS.reduce((acc, tag) => {
  acc[tag.value] = tag.label;
  return acc;
}, {});
const AUDIENCE_LABELS = AUDIENCE_BRANCHES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

function uniq(list) {
  return Array.from(new Set(list));
}

function buildAudienceLabel(audienceValues) {
  if (!audienceValues.length || audienceValues.includes('all')) {
    return 'all branches';
  }
  const labels = audienceValues.map((val) => AUDIENCE_LABELS[val] || val.toUpperCase());
  return labels.join(', ');
}

async function findTargetStudents(audienceValues) {
  if (!audienceValues.length || audienceValues.includes('all')) {
    return all(`SELECT id FROM users WHERE role = 'student'`);
  }
  const uniqueValues = uniq(audienceValues.filter((v) => v && v !== 'all'));
  if (!uniqueValues.length) {
    return all(`SELECT id FROM users WHERE role = 'student'`);
  }
  const placeholders = uniqueValues.map(() => '?').join(', ');
  return all(
    `
      SELECT id FROM users 
      WHERE role = 'student' 
        AND LOWER(COALESCE(branch,'')) IN (${placeholders})
    `,
    uniqueValues
  );
}

function normalizeSelection(input, allowedValues) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const normalized = list
    .map((s) => (typeof s === 'string' ? s.trim().toLowerCase() : ''))
    .filter(Boolean)
    .filter((val, idx, arr) => arr.indexOf(val) === idx);
  return normalized.filter((val) => allowedValues.includes(val));
}

const router = express.Router();

// Configure multer for flier uploads
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/', async (req, res) => {
  const events = await all(
    `SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) as num_registrations
     FROM events e WHERE e.created_by = ? ORDER BY e.event_date ASC`,
    [req.session.user.id]
  );
  res.render('organizer/dashboard', { events, tagLabels: TAG_LABELS, branchLabels: AUDIENCE_LABELS });
});

router.get('/posters/new', (req, res) => {
  res.render('organizer/poster_builder', {
    form: {
      event_title: '',
      event_datetime: '',
      event_venue: '',
      description: '',
      theme: 'sunset',
      mode: 'template',
      ai_prompt: '',
    },
    posterResult: null,
    error: null,
    posterThemes: POSTER_THEMES,
  });
});

function formatDateTimeLabel(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

router.post('/posters', async (req, res) => {
  const form = {
    event_title: (req.body.event_title || '').trim(),
    event_datetime: req.body.event_datetime || '',
    event_venue: (req.body.event_venue || '').trim(),
    description: (req.body.description || '').trim(),
    theme: req.body.theme || 'sunset',
    mode: req.body.mode || 'template',
    ai_prompt: (req.body.ai_prompt || '').trim(),
  };

  try {
    const posterResult = await generatePosterImage({
      title: form.event_title,
      datetime: formatDateTimeLabel(form.event_datetime),
      venue: form.event_venue,
      description: form.description,
      theme: form.theme,
      mode: form.mode,
      aiPrompt: form.ai_prompt,
    });

    res.render('organizer/poster_builder', {
      form,
      posterResult,
      error: null,
      posterThemes: POSTER_THEMES,
    });
  } catch (err) {
    res.status(400).render('organizer/poster_builder', {
      form,
      posterResult: null,
      error: err.message || 'Failed to build poster',
      posterThemes: POSTER_THEMES,
    });
  }
});

router.get('/events/new', (req, res) => {
  res.render('organizer/event_form', {
    event: null,
    error: null,
    tagOptions: EVENT_TAGS,
    branchOptions: AUDIENCE_BRANCHES,
  });
});

router.post('/events', upload.single('flier'), async (req, res) => {
  const { title, description, event_date, google_form_url, event_type } = req.body;
  const tags = normalizeSelection(req.body.tags, TAG_VALUES);
  const audience = normalizeSelection(req.body.audience_branches, AUDIENCE_VALUES);
  const tagsCsv = tags.join(',');
  const audienceCsv = audience.length ? audience.join(',') : 'all';
  try {
    // Validate not in the past
    const today = new Date(); today.setHours(0,0,0,0);
    const picked = new Date(event_date);
    if (isNaN(picked.getTime()) || picked < today) {
      return res
        .status(400)
        .render('organizer/event_form', {
          event: { ...req.body, tags: tagsCsv, audience_branches: audienceCsv },
          error: 'Event date must be today or later',
          tagOptions: EVENT_TAGS,
          branchOptions: AUDIENCE_BRANCHES,
        });
    }
    let flierPath = null;
    const type = event_type === 'flier' ? 'flier' : 'written';
    if (type === 'flier' && req.file) {
      flierPath = `/uploads/${req.file.filename}`;
    }
    await run(
      `INSERT INTO events (title, description, event_date, google_form_url, event_type, flier_path, created_by, tags, audience_branches)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [title, type === 'flier' ? null : description, event_date, google_form_url || null, type, flierPath, req.session.user.id, tagsCsv, audienceCsv]
    );
    const targetStudents = await findTargetStudents(audience);
    const audienceLabel = buildAudienceLabel(audience);
    for (const s of targetStudents) {
      await run(
        `INSERT INTO notifications (user_id, message) VALUES (?, ?)`,
        [
          s.id,
          `New event for ${audienceLabel}: ${title}. Check details and register.`,
        ]
      );
      // Best-effort push
      try {
        await sendPushToUser(s.id, {
          title: 'New Event',
          body: `${title} is available for ${audienceLabel}.`,
          url: '/student',
        });
      } catch (_) {}
    }
    res.redirect('/organizer');
  } catch (err) {
    res.status(400).render('organizer/event_form', {
      event: { ...req.body, tags: tagsCsv, audience_branches: audienceCsv },
      error: 'Failed to create event',
      tagOptions: EVENT_TAGS,
      branchOptions: AUDIENCE_BRANCHES,
    });
  }
});

router.get('/events/:id/edit', async (req, res) => {
  const event = await get(`SELECT * FROM events WHERE id = ? AND created_by = ?`, [req.params.id, req.session.user.id]);
  if (!event) return res.status(404).send('Not found');
  res.render('organizer/event_form', { event, error: null, tagOptions: EVENT_TAGS, branchOptions: AUDIENCE_BRANCHES });
});

router.post('/events/:id/complete', async (req, res) => {
  await run(`UPDATE events SET status = 'completed' WHERE id = ? AND created_by = ?`, [req.params.id, req.session.user.id]);
  res.redirect('/organizer');
});

router.put('/events/:id', upload.single('flier'), async (req, res) => {
  const { title, description, event_date, google_form_url, event_type, keep_existing_flier } = req.body;
  const tags = normalizeSelection(req.body.tags, TAG_VALUES);
  const audience = normalizeSelection(req.body.audience_branches, AUDIENCE_VALUES);
  const tagsCsv = tags.join(',');
  const audienceCsv = audience.length ? audience.join(',') : 'all';
  const today = new Date(); today.setHours(0,0,0,0);
  const picked = new Date(event_date);
  if (isNaN(picked.getTime()) || picked < today) {
    return res.status(400).render('organizer/event_form', {
      event: { ...req.body, id: req.params.id, tags: tagsCsv, audience_branches: audienceCsv },
      error: 'Event date must be today or later',
      tagOptions: EVENT_TAGS,
      branchOptions: AUDIENCE_BRANCHES,
    });
  }
  const type = event_type === 'flier' ? 'flier' : 'written';
  let flierPath = null;
  if (type === 'flier') {
    if (req.file) {
      flierPath = `/uploads/${req.file.filename}`;
    } else if (keep_existing_flier === '1') {
      const current = await get(`SELECT flier_path FROM events WHERE id=? AND created_by=?`, [req.params.id, req.session.user.id]);
      flierPath = current ? current.flier_path : null;
    }
  }
  await run(
    `UPDATE events SET title=?, description=?, event_date=?, google_form_url=?, event_type=?, flier_path=?, tags=?, audience_branches=? WHERE id=? AND created_by=?`,
    [title, type === 'flier' ? null : description, event_date, google_form_url || null, type, flierPath, tagsCsv, audienceCsv, req.params.id, req.session.user.id]
  );
  res.redirect('/organizer');
});

router.delete('/events/:id', async (req, res) => {
  await run(`DELETE FROM events WHERE id=? AND created_by=?`, [req.params.id, req.session.user.id]);
  await run(`DELETE FROM registrations WHERE event_id=?`, [req.params.id]);
  await run(`DELETE FROM feedback WHERE event_id=?`, [req.params.id]);
  res.redirect('/organizer');
});

router.get('/events/:id/feedback', async (req, res) => {
  const event = await get(`SELECT * FROM events WHERE id = ? AND created_by = ?`, [req.params.id, req.session.user.id]);
  if (!event) return res.status(404).send('Not found');
  const feedback = await all(
    `SELECT f.*, u.username FROM feedback f JOIN users u ON f.student_id = u.id WHERE f.event_id = ? ORDER BY f.created_at DESC`,
    [req.params.id]
  );
  res.render('organizer/feedback_list', { event, feedback });
});

router.get('/students', async (req, res) => {
  const students = await all(
    `SELECT id, username, email, branch FROM users WHERE role = 'student' ORDER BY username ASC`
  );
  const alert = req.session.organizerAlert || null;
  delete req.session.organizerAlert;
  res.render('organizer/students', {
    students,
    branchOptions: BRANCHES,
    alert,
  });
});

router.post('/students/:id/branch', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    return res.redirect('/organizer/students');
  }
  const requested = typeof req.body.branch === 'string' ? req.body.branch.trim().toLowerCase() : '';
  const normalized = BRANCH_VALUES.includes(requested) ? requested : null;
  await run(`UPDATE users SET branch = ? WHERE id = ? AND role = 'student'`, [normalized, studentId]);
  req.session.organizerAlert = normalized ? 'Branch updated.' : 'Branch cleared.';
  res.redirect('/organizer/students');
});

module.exports = router;


