# Dayline

A minimalist, mobile-first daily timeline planner. Plain HTML/CSS/JavaScript with no build step. GitHub Pages serves the front end; Supabase provides email magic-link authentication and private cloud-synced plans.

## Features

- Daily timeline with overlapping plans in side-by-side columns and a current-time marker
- Week navigation, Today button, and an upcoming view
- Create, edit, complete, and delete plans with categories and notes
- Local browser storage when signed out or unconfigured
- Supabase cloud sync for signed-in users, protected by row-level security
- Mobile layout and a web app manifest

## GitHub Pages: renarsmb/Siphon

The app is at the root of the `master` branch. There is no build command, package install, or environment-variable injection. All asset and manifest paths are relative so they work under `/Siphon/`. `.nojekyll` disables Jekyll processing.

1. Open [Settings → Pages](https://github.com/renarsmb/Siphon/settings/pages).
2. Choose **Deploy from a branch**, select **master** and **/(root)**, and save.
3. When GitHub reports a successful deployment, open **https://renarsmb.github.io/Siphon/**.

This repository is private. GitHub Pages for private repositories requires a plan that supports it; preparation of these files does not enable Pages or change repository visibility. See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Supabase setup

1. Create a Supabase project and run `schema.sql` in its SQL Editor. It creates the plans table, index, update trigger, and per-user select/insert/update/delete policies. The script can be rerun; it recreates only Dayline's named policies and trigger inside a transaction.
2. Under **Authentication → URL Configuration**, set **Site URL** to `https://renarsmb.github.io/Siphon/` and add that exact URL under **Redirect URLs**. Enable Email authentication. Use the actual Pages address instead if you later configure a custom domain.
3. Edit `config.js` with the project URL and **publishable** key, then commit the change. The legacy `anon` key is also supported. These values are public browser configuration, not secrets. A `.env` file or GitHub Actions secret is not automatically read by this static app.
4. Open **Account** and request a sign-in link. Open it in the browser/device you want to use. Newly created cloud plans sync to that account; existing local plans stay on that browser and are not automatically migrated. There is currently no import/export interface.
5. Verify with two accounts that each sees only its own plans before relying on cloud storage.

Never add a Supabase secret key, `service_role` key, database password, access token, or private key to `config.js`, source files, or GitHub Pages. Secret/service-role keys bypass row-level security. Keep RLS enabled. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

`config.js` intentionally ships with empty values, so the app works in local mode until configured. No Supabase project or credentials are provisioned by this repository.

## Local preview

Run `python3 -m http.server 8000` from the repository root and visit `http://localhost:8000/`. For local magic-link testing, add that URL to Supabase's redirect allowlist as well. Do not open the app using a `file://` URL.

## Behavior and limits

- Times are local wall-clock times and do not shift when traveling. Plans must start and end on the same date.
- Cloud operations require connectivity. Local plans are stored in this browser only; clearing its storage removes them.
- The Supabase SDK loads from a CDN. Local mode still starts if it is unavailable, but the app has no service worker or full offline-install support. The SDK URL follows version 2; pin and self-host a tested version if deterministic/offline loading is required.
- The manifest uses an SVG icon; installation support varies by browser.

## Replacement and history

Dayline replaces the previous Siphon project files in a normal commit on `master`. The previous tip remains its parent, preserving the repository and earlier history.
