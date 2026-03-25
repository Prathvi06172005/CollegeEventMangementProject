const express = require('express');
const { all, get, run } = require('../storage/db');
const { EVENT_TAGS, BRANCHES } = require('../constants/catalog');

const TAG_LABELS = EVENT_TAGS.reduce((acc, tag) => {
  acc[tag.value] = tag.label;
  return acc;
}, {});
const BRANCH_LABELS = BRANCHES.reduce((acc, branch) => {
  acc[branch.value] = branch.label;
  return acc;
}, {});

const BRANCH_VALUES = BRANCHES.map((b) => b.value);

const router = express.Router();

router.use(async (req, res, next) => {
  try {
    const latest = await get(`SELECT branch FROM users WHERE id = ?`, [req.session.user.id]);
    if (latest && req.session.user.branch !== latest.branch) {
      req.session.user.branch = latest.branch;
    }
  } catch (_) {
    // Ignore sync errors; student flow will continue with existing session data.
  }
  next();
});

function normalizeBranchInput(branch) {
  return typeof branch === 'string' ? branch.trim().toLowerCase() : '';
}

function parseCsvList(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((s) => (s || '').trim().toLowerCase())
    .filter(Boolean);
}

function canStudentSeeEvent(audienceCsv, branch) {
  const audienceList = parseCsvList(audienceCsv || '');
  if (!audienceList.length || audienceList.includes('all')) return true;
  if (!branch) return false;
  return audienceList.includes(branch);
}

function buildAudienceFilter(branch) {
  const commonConditions = `
      audience_branches IS NULL
      OR audience_branches = ''
      OR LOWER(audience_branches) = 'all'
      OR INSTR(',' || LOWER(audience_branches) || ',', ',all,') > 0`;
  if (!branch) {
    return {
      clause: ` AND (
        ${commonConditions}
      )`,
      params: [],
    };
  }
  return {
    clause: ` AND (
        ${commonConditions}
        OR INSTR(',' || LOWER(audience_branches) || ',', ',' || ? || ',') > 0
      )`,
    params: [branch],
  };
}

async function loadTagPreferences(studentId) {
  const rows = await all(
    `SELECT e.tags FROM registrations r 
     JOIN events e ON r.event_id = e.id 
     WHERE r.student_id = ?`,
    [studentId]
  );
  const counts = {};
  for (const row of rows) {
    const tags = parseCsvList(row.tags || '');
    tags.forEach((tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  }
  return counts;
}

function daysUntil(dateString) {
  if (!dateString) return Infinity;
  const target = new Date(dateString);
  if (isNaN(target.getTime())) return Infinity;
  return Math.round((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

async function buildRecommendations(studentId, branch, events) {
  const tagPrefs = await loadTagPreferences(studentId);
  const scored = [];
  for (const event of events) {
    if (event.status !== 'scheduled' || event.is_registered) continue;
    const eventTags = parseCsvList(event.tags || '');
    const audience = parseCsvList(event.audience_branches || 'all');
    let score = 0;
    const reasons = [];

    if (branch) {
      if (!audience.length || audience.includes('all')) {
        score += 15;
        reasons.push('Open to every branch');
      } else if (audience.includes(branch)) {
        score += 40;
        reasons.push(`Tailored for ${BRANCH_LABELS[branch] || branch.toUpperCase()}`);
      } else {
        score += 8; // still recommend occasionally
      }
    }

    if (eventTags.length) {
      score += 10;
      const favorite = eventTags.find((tag) => tagPrefs[tag]);
      if (favorite) {
        score += Math.min(tagPrefs[favorite] * 8, 24);
        reasons.push(`Because you liked ${TAG_LABELS[favorite] || favorite}`);
      }
    }

    const popularity = Math.min((event.num_registered || 0) * 2, 24);
    if (popularity >= 12) {
      reasons.push('Trending pick');
    }
    score += popularity;

    const days = daysUntil(event.event_date);
    if (Number.isFinite(days)) {
      if (days <= 7) {
        score += 15;
        reasons.push('Happening soon');
      } else if (days <= 21) {
        score += 5;
      }
    }

    if (score > 0) {
      scored.push({
        event,
        score,
        reasons: Array.from(new Set(reasons)).slice(0, 2),
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

router.get('/', async (req, res) => {
  const branch = normalizeBranchInput(req.session.user.branch || '');
  const { clause: audienceClause, params: audienceParams } = buildAudienceFilter(branch);
  const events = await all(
    `SELECT e.*, 
            EXISTS(SELECT 1 FROM registrations r WHERE r.event_id=e.id AND r.student_id=?) AS is_registered,
            (SELECT COUNT(*) FROM feedback f WHERE f.event_id=e.id) as num_feedback,
            (SELECT COUNT(*) FROM registrations r2 WHERE r2.event_id = e.id) as num_registered
     FROM events e
     WHERE 1=1 ${audienceClause}
     ORDER BY e.event_date ASC`,
    [req.session.user.id, ...audienceParams]
  );
  const notifications = await all(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [req.session.user.id]
  );
  const recommendations = await buildRecommendations(req.session.user.id, branch || null, events);
  res.render('student/dashboard', {
    events,
    notifications,
    recommendations,
    tagLabelMap: TAG_LABELS,
    activeBranch: branch || '',
    activeBranchLabel: branch ? (BRANCH_LABELS[branch] || branch.toUpperCase()) : null,
    formSubmitted: req.session.formSubmitted || {},
  });
});

router.get('/notifications/latest', async (req, res) => {
  try {
    const { since } = req.query;
    const userId = req.session.user.id;
    const params = [userId];
    let sql = `SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at ASC LIMIT 10`;
    if (since && !Number.isNaN(Date.parse(since))) {
      sql = `SELECT * FROM notifications WHERE user_id = ? AND datetime(created_at) > datetime(?) ORDER BY created_at ASC LIMIT 10`;
      params.push(new Date(since).toISOString());
    }
    const rows = await all(sql, params);
    if (rows.length) {
      const ids = rows.map((n) => n.id);
      const placeholders = ids.map(() => '?').join(', ');
      await run(`UPDATE notifications SET read = 1 WHERE id IN (${placeholders})`, ids);
    }
    res.json({ notifications: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// Browse events with simple search
router.get('/events', async (req, res) => {
  const q = (req.query.q || '').trim();
  const branch = normalizeBranchInput(req.session.user.branch || '');
  const searchParams = [];
  let where = `WHERE 1=1`;
  // Show scheduled and completed, but prioritize upcoming
  if (q) {
    where += ` AND (e.title LIKE ? OR e.description LIKE ?)`;
    searchParams.push(`%${q}%`, `%${q}%`);
  }
  const { clause: audienceClause, params: audienceParams } = buildAudienceFilter(branch);
  where += audienceClause;
  const events = await all(
    `SELECT e.*,
            EXISTS(SELECT 1 FROM registrations r WHERE r.event_id=e.id AND r.student_id=?) AS is_registered
     FROM events e ${where}
     ORDER BY (e.status='scheduled') DESC, e.event_date ASC`,
    [req.session.user.id, ...searchParams, ...audienceParams]
  );
  res.render('student/browse', {
    events,
    q,
    formSubmitted: req.session.formSubmitted || {},
    tagLabelMap: TAG_LABELS,
    activeBranch: branch || '',
    activeBranchLabel: branch ? (BRANCH_LABELS[branch] || branch.toUpperCase()) : null,
  });
});

router.post('/events/:id/register', async (req, res) => {
  const branch = normalizeBranchInput(req.session.user.branch || '');
  const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
  if (!event) return res.status(404).send('Not found');
  if (!canStudentSeeEvent(event.audience_branches, branch)) {
    return res.status(403).send('This event is not available for your branch.');
  }
  // Require student to confirm they submitted the Google Form
  if (event.google_form_url) {
    if (!req.session.formSubmitted) req.session.formSubmitted = {};
    if (!req.session.formSubmitted[event.id]) {
      req.session.alert = 'Please submit the Google Form and click "I submitted the form" before marking Registered.';
      return res.redirect('/student');
    }
  }
  try {
    await run(`INSERT INTO registrations (event_id, student_id) VALUES (?, ?)`, [event.id, req.session.user.id]);
  } catch (_) {}
  if (req.session.formSubmitted) delete req.session.formSubmitted[event.id];
  res.redirect('/student');
});

// Redirect to Google Form (no longer marks anything; confirmation is explicit)
router.get('/events/:id/form', async (req, res) => {
  const branch = normalizeBranchInput(req.session.user.branch || '');
  const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
  if (!event) return res.status(404).send('Not found');
  if (!canStudentSeeEvent(event.audience_branches, branch)) {
    return res.status(403).send('This event is not available for your branch.');
  }
  if (!event.google_form_url) return res.redirect('/student');
  res.redirect(event.google_form_url);
});

// Student confirms they submitted the Google Form
router.post('/events/:id/form-submitted', async (req, res) => {
  const branch = normalizeBranchInput(req.session.user.branch || '');
  const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
  if (!event) return res.status(404).send('Not found');
  if (!canStudentSeeEvent(event.audience_branches, branch)) {
    return res.status(403).send('This event is not available for your branch.');
  }
  if (!event.google_form_url) return res.redirect('/student');
  if (!req.session.formSubmitted) req.session.formSubmitted = {};
  req.session.formSubmitted[event.id] = true;
  req.session.alert = 'Form submission confirmed. You can now mark Registered.';
  res.redirect('/student');
});

router.get('/events/:id/feedback', async (req, res) => {
  const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
  if (!event) return res.status(404).send('Not found');
  if (event.status !== 'completed') return res.status(400).send('Feedback available after completion');
  const existing = await get(`SELECT * FROM feedback WHERE event_id=? AND student_id=?`, [event.id, req.session.user.id]);
  res.render('student/feedback_form', { event, existing, error: null });
});

router.post('/events/:id/feedback', async (req, res) => {
  const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
  if (!event) return res.status(404).send('Not found');
  if (event.status !== 'completed') return res.status(400).send('Feedback available after completion');
  const { rating, comments, student_name, branch, section, suggestions,
    q_organization, q_content, q_venue, q_engagement,
    q_organization_text, q_content_text, q_venue_text, q_engagement_text } = req.body;
  try {
    await run(
      `INSERT INTO feedback (
         event_id, student_id, rating, comments, student_name, branch, section, suggestions,
         q_organization, q_content, q_venue, q_engagement,
         q_organization_text, q_content_text, q_venue_text, q_engagement_text
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(event_id, student_id) DO UPDATE SET 
         rating=excluded.rating,
         comments=excluded.comments,
         student_name=excluded.student_name,
         branch=excluded.branch,
         section=excluded.section,
         suggestions=excluded.suggestions,
         q_organization=excluded.q_organization,
         q_content=excluded.q_content,
         q_venue=excluded.q_venue,
         q_engagement=excluded.q_engagement,
         q_organization_text=excluded.q_organization_text,
         q_content_text=excluded.q_content_text,
         q_venue_text=excluded.q_venue_text,
         q_engagement_text=excluded.q_engagement_text`,
      [
        event.id,
        req.session.user.id,
        Number(rating),
        comments || null,
        student_name || null,
        branch || null,
        section || null,
        suggestions || null,
        q_organization ? Number(q_organization) : null,
        q_content ? Number(q_content) : null,
        q_venue ? Number(q_venue) : null,
        q_engagement ? Number(q_engagement) : null,
        q_organization_text || null,
        q_content_text || null,
        q_venue_text || null,
        q_engagement_text || null,
      ]
    );
    res.redirect('/student');
  } catch (err) {
    res.status(400).render('student/feedback_form', { event, existing: null, error: 'Failed to submit feedback' });
  }
});

module.exports = router;


