const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const { initDb } = require('./storage/db');
const { exec } = require('child_process');
const authRoutes = require('./web/auth');
const organizerRoutes = require('./web/organizer');
const studentRoutes = require('./web/student');
const { startReminderJobs } = require('./workers/reminders');
const push = require('./web/push');

const app = express();

// View engine and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));
// Expose PWA assets from the root scope
app.get('/manifest.webmanifest', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'manifest.webmanifest'));
});
app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'sw.js'));
});

// Parsers and overrides
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));

// Sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, '..', 'data') }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

// Expose user to views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  if (req.session && req.session.alert) {
    res.locals.alert = req.session.alert;
    delete req.session.alert;
  } else {
    res.locals.alert = null;
  }
  next();
});

// Routes
app.use('/', authRoutes);
app.use('/organizer', ensureRole('organizer'), organizerRoutes);
app.use('/student', ensureRole('student'), studentRoutes);
app.use('/push', (req, res, next) => { if (!req.session.user) return res.redirect('/login'); next(); }, push.router);

app.get('/', (req, res) => {
  if (!req.session.user) return res.render('home');
  if (req.session.user.role === 'organizer') return res.redirect('/organizer');
  return res.redirect('/student');
});

app.use((req, res) => {
  res.status(404).render('404');
});

function ensureRole(expectedRole) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== expectedRole) return res.status(403).send('Forbidden');
    next();
  };
}

const PORT = process.env.PORT || 3000;

async function boot() {
  await initDb(path.join(__dirname, '..', 'data', 'app.sqlite'));
  startReminderJobs();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Auto-open the app in the default browser (best-effort, no external deps)
    if (!process.env.CI && !process.env.NO_AUTO_OPEN) {
      const url = `http://localhost:${PORT}`;
      try {
        if (process.platform === 'win32') exec(`start "" "${url}"`);
        else if (process.platform === 'darwin') exec(`open "${url}"`);
        else exec(`xdg-open "${url}"`);
      } catch (_) {}
    }
  });
}

boot();


