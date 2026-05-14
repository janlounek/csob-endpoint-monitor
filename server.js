const express = require('express');
const path = require('path');
require('dotenv').config();

const { initDb } = require('./db/database');
const basicAuth = require('./src/middleware/basic-auth');
const apiRoutes = require('./src/routes/api');
const dashboardRoutes = require('./src/routes/dashboard');
const scheduler = require('./src/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic auth runs before static + routes; no-op unless ADMIN_USER/ADMIN_PASS set.
app.use(basicAuth);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);
app.use('/', dashboardRoutes);

initDb();
scheduler.start();

app.listen(PORT, () => {
  console.log(`Endpoint Monitor running on http://localhost:${PORT}`);
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    console.log('  Basic auth: enabled');
  } else {
    console.log('  Basic auth: disabled (set ADMIN_USER and ADMIN_PASS to enable)');
  }
});
