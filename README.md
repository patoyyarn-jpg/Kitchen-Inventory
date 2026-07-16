# Kitchen Inventory Rail — with scheduled reorder alerts

This is the same inventory tracker you already saw, now running on a real
server so it can check stock levels once a day and email (and optionally
text) you a reorder list automatically — even if nobody has the page open.

## What you get

- The same rail-of-tickets inventory UI, now backed by a shared database
  (so everyone on the team sees the same live counts)
- A daily scheduled check, at a time you set, that emails a reorder list
  if anything is low or out
- Optional SMS alerts via Twilio, if you want texts too
- A "Send test alert now" button so you can confirm it's wired up correctly
  without waiting for the schedule

## 1. Put this code somewhere Render can see it

Render deploys from a Git repository. The simplest path:

1. Create a new **empty repository** on GitHub (e.g. `kitchen-inventory`).
2. Unzip this project locally, then from inside the folder:
   ```
   git init
   git add .
   git commit -m "Kitchen inventory tracker with alerts"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/kitchen-inventory.git
   git push -u origin main
   ```

## 2. Create the database on Render

1. In the Render dashboard: **New → PostgreSQL**
2. Give it any name, pick the free tier, create it.
3. Once it's up, you don't need to copy anything manually — in the next
   step you'll link it to the web service and Render wires up the
   connection string for you.

## 3. Create the web service on Render

1. **New → Web Service** → connect the GitHub repo you just pushed.
2. Environment: **Node**
3. Build command: `npm install`
4. Start command: `npm start`
5. Under **Environment → Add Environment Variable**, either:
   - Use Render's "Add from Database" option to link `DATABASE_URL` to the
     Postgres instance you created, **or**
   - Copy the "External Database URL" from the Postgres dashboard page and
     paste it in as `DATABASE_URL` manually.
6. Add the email variables from `.env.example` (`SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). For Gmail, `SMTP_USER` is your
   Gmail address and `SMTP_PASS` is an **App Password**
   (https://myaccount.google.com/apppasswords — requires 2-Step Verification
   turned on first).
7. If you want text alerts too, add the `TWILIO_*` variables from a Twilio
   account. If you skip these, email-only alerts still work fine.
8. Deploy.

Render will build it, run it, and give you a URL like
`https://kitchen-inventory.onrender.com` — that's your live tracker.

## 4. Set your alert preferences

Open the deployed URL, click **⚙ Alert settings** in the top bar, and set:
- The email (and optionally phone number) that should receive alerts
- The time of day the daily check should run
- Your timezone

Click **Save settings**, then **Send test alert now** to confirm it
actually reaches your inbox (and phone, if configured) before trusting the
schedule.

## Notes on the free tier

Render's free web services **spin down after inactivity** and spin back up
on the next request — which means a truly "always on" cron check can miss
its window if the service happens to be asleep at that exact time. Two ways
around this if it matters to you:
- Upgrade to Render's cheapest paid instance type (keeps it always running), or
- Use an external free "uptime pinger" (e.g. UptimeRobot) to hit your app's
  URL every few minutes, which also keeps it awake.

The free Postgres database is also limited in size and Render deletes free
databases after 90 days unless upgraded — fine for testing, worth upgrading
once this is part of daily kitchen operations.

## Local testing (optional)

If you want to try it on your own machine before deploying:
```
npm install
cp .env.example .env   # fill in your own DATABASE_URL and SMTP settings
npm start
```
Then open `http://localhost:3000`.
