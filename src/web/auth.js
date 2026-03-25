const express = require('express');
const bcrypt = require('bcryptjs');
const { get } = require('../storage/db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (!user) return res.status(401).render('login', { error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).render('login', { error: 'Invalid credentials' });
  req.session.user = { id: user.id, username: user.username, role: user.role, branch: user.branch || null };
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;


