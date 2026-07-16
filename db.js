const { Pool } = require('pg');

// Render injects DATABASE_URL automatically when you attach a Postgres
// instance to this web service. Locally, put it in a .env file.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stations (
      name TEXT PRIMARY KEY
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      station TEXT NOT NULL REFERENCES stations(name) ON DELETE CASCADE,
      qty NUMERIC NOT NULL DEFAULT 0,
      par NUMERIC NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'ea'
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      alert_email TEXT,
      alert_phone TEXT,
      alert_hour INTEGER NOT NULL DEFAULT 7,
      alert_minute INTEGER NOT NULL DEFAULT 0,
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      last_sent_date TEXT,
      CHECK (id = 1)
    );
  `);
  // Ensure exactly one settings row exists
  await pool.query(`
    INSERT INTO settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;
  `);

  // Seed starter stations/items only if the table is empty, so a redeploy
  // never wipes real data.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM stations');
  if (rows[0].c === 0) {
    const stations = ['Walk-in Cooler', 'Freezer', 'Dry Storage', 'Bar', 'Prep Line'];
    for (const s of stations) {
      await pool.query('INSERT INTO stations (name) VALUES ($1)', [s]);
    }
    const seedItems = [
      ['Chicken Breast', 'Walk-in Cooler', 18, 30, 'lb'],
      ['Heavy Cream', 'Walk-in Cooler', 4, 12, 'qt'],
      ['Butter', 'Walk-in Cooler', 0, 20, 'lb'],
      ['Ahi Tuna', 'Freezer', 22, 15, 'lb'],
      ['Puff Pastry', 'Freezer', 6, 10, 'box'],
      ['Basmati Rice', 'Dry Storage', 40, 25, 'lb'],
      ['Olive Oil', 'Dry Storage', 2, 8, 'gal'],
      ["Tito's Vodka", 'Bar', 3, 12, 'bottle'],
      ['Fresh Lime', 'Bar', 0, 5, 'case'],
      ['Kale', 'Prep Line', 9, 10, 'lb'],
    ];
    for (const [name, station, qty, par, unit] of seedItems) {
      await pool.query(
        'INSERT INTO items (name, station, qty, par, unit) VALUES ($1,$2,$3,$4,$5)',
        [name, station, qty, par, unit]
      );
    }
  }
}

module.exports = { pool, init };
