const express = require('express');
const router = express.Router();
const db = require('../../db/database');
const { CHECKER_LABELS } = require('../checkers');

// NOTE: don't pass `client` as a top-level data key in res.render — EJS treats it as the
// compile-time `client` option (client-side compile mode), which bypasses the wrapper
// that supplies the `include` helper. Use `currentClient` instead.

// Landing page — list of clients
router.get('/', (req, res) => {
  res.render('index', { currentClient: null });
});

// Client CRUD
router.get('/clients/new', (req, res) => {
  res.render('client-form', { currentClient: null });
});

router.get('/c/:slug', (req, res) => {
  const client = db.getClientBySlug(req.params.slug);
  if (!client) return res.redirect('/');
  res.render('dashboard', { currentClient: client, checkerLabels: CHECKER_LABELS });
});

router.get('/c/:slug/edit', (req, res) => {
  const client = db.getClientBySlug(req.params.slug);
  if (!client) return res.redirect('/');
  res.render('client-form', { currentClient: client });
});

router.get('/c/:slug/settings', (req, res) => {
  const client = db.getClientBySlug(req.params.slug);
  if (!client) return res.redirect('/');
  res.render('client-settings', { currentClient: client });
});

// Site CRUD within a client
router.get('/c/:slug/sites/new', (req, res) => {
  const client = db.getClientBySlug(req.params.slug);
  if (!client) return res.redirect('/');
  res.render('site-form', { currentClient: client, site: null, checkerLabels: CHECKER_LABELS });
});

router.get('/c/:slug/sites/:id', (req, res) => {
  const client = db.getClientBySlug(req.params.slug);
  if (!client) return res.redirect('/');
  const site = db.getSiteById(parseInt(req.params.id));
  if (!site || site.client_id !== client.id) return res.redirect(`/c/${client.slug}`);
  res.render('site-detail', { currentClient: client, site, checkerLabels: CHECKER_LABELS });
});

router.get('/c/:slug/sites/:id/edit', (req, res) => {
  const client = db.getClientBySlug(req.params.slug);
  if (!client) return res.redirect('/');
  const site = db.getSiteById(parseInt(req.params.id));
  if (!site || site.client_id !== client.id) return res.redirect(`/c/${client.slug}`);
  res.render('site-form', { currentClient: client, site, checkerLabels: CHECKER_LABELS });
});

// Global settings (cron schedule only)
router.get('/settings', (req, res) => {
  res.render('settings', { currentClient: null });
});

module.exports = router;
