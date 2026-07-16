const nodemailer = require('nodemailer');
const { pool } = require('./db');

function status(item) {
  if (Number(item.qty) <= 0) return 'out';
  if (Number(item.qty) < Number(item.par)) return 'low';
  return 'ok';
}

async function getReorderItems() {
  const { rows } = await pool.query('SELECT * FROM items ORDER BY station, name');
  return rows
    .map(i => ({ ...i, s: status(i), suggested: Math.max(0, i.par - i.qty) }))
    .filter(i => i.s !== 'ok');
}

function buildMessageText(items, { forSms = false } = {}) {
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric'
  });
  if (items.length === 0) {
    return `Kitchen reorder check — ${dateStr}: everything is at or above par. No action needed.`;
  }
  if (forSms) {
    // Keep SMS short — just the essentials.
    const lines = items
      .slice(0, 12)
      .map(i => `${i.s === 'out' ? '86' : 'LOW'} ${i.name}: order ${i.suggested} ${i.unit}`);
    const more = items.length > 12 ? `\n+${items.length - 12} more, see email` : '';
    return `Kitchen reorder (${dateStr}):\n${lines.join('\n')}${more}`;
  }
  const byStation = {};
  items.forEach(i => { (byStation[i.station] ||= []).push(i); });
  const lines = [`Kitchen reorder list — ${dateStr}`, ''];
  Object.keys(byStation).forEach(station => {
    lines.push(`${station}:`);
    byStation[station].forEach(i => {
      const tag = i.s === 'out' ? '[OUT]' : '[LOW]';
      lines.push(`  ${tag} ${i.name} — order ${i.suggested} ${i.unit} (on hand ${i.qty}, par ${i.par})`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

async function sendEmail(to, text) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[alerts] SMTP not configured — skipping email send.');
    return { sent: false, reason: 'SMTP not configured' };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Kitchen reorder list — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    text
  });
  return { sent: true };
}

async function sendSms(to, text) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
    console.log('[alerts] Twilio not configured — skipping SMS send.');
    return { sent: false, reason: 'Twilio not configured' };
  }
  const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await twilio.messages.create({
    body: text,
    from: process.env.TWILIO_FROM_NUMBER,
    to
  });
  return { sent: true };
}

// Runs the check-and-send. `force` skips the "already sent today" guard,
// used by the manual "send test alert now" button.
async function runAlertCheck({ force = false } = {}) {
  const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
  const settings = rows[0];
  const today = new Date().toISOString().slice(0, 10);

  if (!force && settings.last_sent_date === today) {
    return { skipped: true, reason: 'already sent today' };
  }

  const items = await getReorderItems();

  // Nothing needed and this isn't a manual test → don't bother anyone.
  if (items.length === 0 && !force) {
    await pool.query('UPDATE settings SET last_sent_date = $1 WHERE id = 1', [today]);
    return { skipped: true, reason: 'nothing to reorder' };
  }

  const results = {};
  if (settings.alert_email) {
    results.email = await sendEmail(settings.alert_email, buildMessageText(items));
  }
  if (settings.alert_phone) {
    results.sms = await sendSms(settings.alert_phone, buildMessageText(items, { forSms: true }));
  }

  if (!force) {
    await pool.query('UPDATE settings SET last_sent_date = $1 WHERE id = 1', [today]);
  }

  return { skipped: false, itemCount: items.length, results };
}

module.exports = { runAlertCheck, getReorderItems, buildMessageText };
