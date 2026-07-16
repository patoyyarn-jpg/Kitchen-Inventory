require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const { pool, init } = require('./db');
const { runAlertCheck } = require('./alerts');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- API ----

app.get('/api/state', async (req, res) => {
  try {
    const stations = (await pool.query('SELECT name FROM stations ORDER BY name')).rows.map(r => r.name);
    const items = (await pool.query('SELECT * FROM items ORDER BY station, name')).rows;
    const settings = (await pool.query('SELECT * FROM settings WHERE id = 1')).rows[0];
    res.json({ stations, items, settings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

app.post('/api/stations', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Station name required' });
    await pool.query('INSERT INTO stations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name.trim()]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add station' });
  }
});

app.delete('/api/stations/:name', async (req, res) => {
  try {
    await pool.query('DELETE FROM stations WHERE name = $1', [req.params.name]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const { name, station, qty, par, unit } = req.body;
    if (!name || !station) return res.status(400).json({ error: 'Name and station required' });
    const { rows } = await pool.query(
      'INSERT INTO items (name, station, qty, par, unit) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name.trim(), station, qty || 0, par || 0, (unit || 'ea').trim()]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

app.put('/api/items/:id', async (req, res) => {
  try {
    const { qty, par, name, unit } = req.body;
    const { rows } = await pool.query(
      `UPDATE items SET
         qty = COALESCE($1, qty),
         par = COALESCE($2, par),
         name = COALESCE($3, name),
         unit = COALESCE($4, unit)
       WHERE id = $5 RETURNING *`,
      [qty, par, name, unit, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { alert_email, alert_phone, alert_hour, alert_minute, timezone } = req.body;
    const { rows } = await pool.query(
      `UPDATE settings SET
         alert_email = $1, alert_phone = $2, alert_hour = $3, alert_minute = $4, timezone = $5
       WHERE id = 1 RETURNING *`,
      [alert_email || null, alert_phone || null, alert_hour, alert_minute, timezone]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Manual "send it right now" — great for confirming SMTP/Twilio setup works
// before trusting the schedule.
app.post('/api/test-alert', async (req, res) => {
  try {
    const result = await runAlertCheck({ force: true });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send test alert', detail: e.message });
  }
});

// ---- Scheduler ----
// Checks every 15 minutes whether "now" matches the configured alert time
// (in the configured timezone) and hasn't already fired today.
cron.schedule('*/15 * * * *', async () => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
    const s = rows[0];
    if (!s) return;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: s.timezone }));
    const withinWindow =
      now.getHours() === s.alert_hour &&
      Math.abs(now.getMinutes() - s.alert_minute) < 15;
    if (withinWindow) {
      const result = await runAlertCheck({ force: false });
      console.log('[cron] Alert check ran:', result);
    }
  } catch (e) {
    console.error('[cron] Alert check failed:', e);
  }
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => {
    app.listen(PORT, () => console.log(`Kitchen inventory server running on port ${PORT}`));
  })
  .catch(e => {
    console.error('Failed to initialize database:', e);
    process.exit(1);
  });
