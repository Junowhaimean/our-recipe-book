# Our Recipe Book — start here

**Version 1.0 • Personal family cookbook • No required subscription**

This is a working starter application built as a Progressive Web App (PWA): it can be opened on an iPhone, iPad, Mac, or Windows computer and added to an iPhone Home Screen. Its code is yours to keep, change, and move to another host.

## What already works

- Add, edit, find, filter, favorite, and delete recipes.
- Attach one screenshot or photo to each recipe.
- Optionally extract text from that photo in the browser using Tesseract.js (internet required for loading OCR components; **review everything it transcribes**).
- Save a recipe's original website / social media URL, ingredients, directions, cooking times, and your own notes.
- Store a local copy of your recipes, including photos, in IndexedDB for offline reading and editing.
- Export a single **JSON backup including the photos**, and restore/merge that backup.
- **Optional two-way household sync**: share a private cookbook across your devices and your husband's using Supabase, with a long, random household invitation code.
- PWA Home Screen icon and offline-capable app shell after initial installation.

## What is NOT included in version 1

- This package is **not hosted or installed** for you; publishing requires setup.
- Social media URL *auto-extraction* is **not included**. Facebook/Instagram/TikTok posts often restrict automated extraction. Paste the source link, attach a screenshot, or copy text yourself.
- Only **one screenshot/image per recipe** is supported; multi-page cookbook recipes require combining screenshots or copying text.
- OCR is best-effort and may misread quantities, fractions, cooking temperatures, or timing.
- Live cloud syncing needs an outside hosting/database service, internet, and one-time configuration. **Free cloud service is not guaranteed forever**; the export is your insurance.
- Cloud sync uses "last edited wins" when two people update the same recipe simultaneously. It does not provide edit history or conflict resolution.
- This version is a starter release, not a fully audited production app. Run through the included checklist before deleting irreplaceable screenshots.

## First try — on a computer

1. Unzip this package.
2. In that folder, serve it through a local web server (opening `index.html` as a `file://` URL is **not** supported):
   - If Python is installed, run `python3 -m http.server 8080` (Windows may use `py -m http.server 8080`).
3. Open `http://localhost:8080` in your browser.
4. Add two test recipes, close and reopen the page, and check that both are still there.
5. Use **Settings & backup → Export complete backup** and place that file somewhere safe.

To use the app on an iPhone, follow the next section to publish it over HTTPS.

## Publish it for free with GitHub Pages

1. Create a free GitHub account at https://github.com/ if you don't have one.
2. Create a **public** repository such as `our-recipe-book`. Public repositories are supported by GitHub Pages on GitHub Free. The *application source code* will be public; your personal recipes are **not** embedded in it.
3. Upload the contents of this unzipped folder (not the zip itself), preserving the `icons/` and `supabase/` subfolders. Ensure `index.html` is at the **repository root**.
4. Open your repository's **Settings → Pages**. In **Build and deployment**, select **Deploy from a branch**, branch `main`, folder `/(root)`, and save.
5. Open the published URL shown under Pages. It generally looks like `https://YOURUSERNAME.github.io/our-recipe-book/`.
6. On an iPhone: open this URL in Safari → Share → **Add to Home Screen** → Add. For other devices, open the same URL in a browser. The local copy is initially **separate on each device** until you enable household cloud sharing below.

**Important:** You can use the app locally without setting up the cloud. However, local-only iPhone and iPad recipe collections do **not** automatically sync. Export/restore is a manual alternative.

## Turn on household sharing (free tier)

Sharing requires a third-party service. The application uses Supabase Free: no per-user recipe app subscription, but subject to Supabase's limits and availability. Supabase currently offers free database/storage quotas and can **pause low-activity free projects**.

### Part A: Create one Supabase project

1. Open https://supabase.com/ and make a free account.
2. Create a project. Give it a strong **database password** and store that password privately. Do not paste it into the recipe app.
3. Open **SQL Editor** in the Supabase dashboard, click **New query**, paste everything in `supabase/schema.sql`, and select **Run**. This creates the private recipes database, household codes, and photo storage permissions.
4. Go to **Authentication → Sign In / Providers**, then **enable Anonymous Sign-Ins**. This lets each device sign in anonymously without sending email or requiring an email/password. Do not enable anonymous sign-ins if you don't intend to use household sharing.
5. Find your project's **Project URL** (in its Connect dialog) and **Publishable API key** (`sb_publishable_…`, under Connect or Settings → API Keys).

Never enter a **secret** or **service_role** key in this application. Those keys bypass database safeguards. You only need the public `sb_publishable_…` key.

### Part B: Create the shared household on your phone

1. Open your deployed Our Recipe Book.
2. Go to **Settings & backup → Share with your household**.
3. Paste the **Supabase Project URL** and **Publishable key**, and click **Save sharing settings**.
4. Click **Connect this device**.
5. Choose **Create our shared cookbook**. Your existing local recipes are now eligible to sync to this household. Wait for the sync to finish (or click **Sync now**).
6. Copy the displayed **24-character invitation code**. Keep it private.

### Part C: Add your husband and your other devices

1. On each other device, open the **same published app URL**.
2. In **Settings & backup**, paste the **same** Supabase URL and publishable key; click **Save sharing settings**.
3. Click **Connect this device**, then **Join existing cookbook**.
4. Enter the **invitation code** from the first device. Use **Sync now** if the recipes do not appear immediately.
5. Both devices can now add and edit shared recipes; changes upload online and are fetched when the app opens, regains focus, or periodically while open (about every 90 seconds).

**Privacy and account limitations:** Recipes are private to devices that have joined the household via their individual Supabase anonymous identity. The database uses Row Level Security and a private photo bucket. There is **no end-to-end encryption**; the cloud provider operates the servers. Anyone given your invitation code can join, so don't post it publicly. Rotating the code prevents *new* joins with the old code; it does not remove devices that already joined. An anonymous device identity cannot be recovered if its browser data is cleared; simply reconnect it as a new device with a valid invite code. Store an exported backup in case you lose every connected device or the cloud account.

## Make a backup BEFORE deleting original photos

1. Import a few screenshots and verify recipe images and text.
2. Open **Settings & backup → Export complete backup**.
3. Save the downloaded `.json` file in **iCloud Drive or another independent location** (and preferably keep an extra copy on a computer or external drive).
4. Verify restoration: on a different device or browser, **Restore / merge backup**, then inspect several recipes and photos.
5. Only then delete the original screenshots from Apple Photos. Deleting from iCloud Photos also deletes them from synced Apple devices.
6. Repeat an export after significant additions or changes; for an active collection, a **monthly** backup is reasonable.

The single backup file is deliberately plain JSON with embedded base64 images. Even if this app disappears, a developer can read it and migrate the entries and pictures.

## Browser / hosting requirements

- A recent version of Safari on iPhone/iPad, or a modern Chrome/Edge/Safari on desktop.
- HTTPS hosting (GitHub Pages works) for Home Screen installation and service-worker support; `http://localhost` works for computer testing.
- Browser IndexedDB storage must be enabled. This app is not intended for private-browsing sessions.
- Optional OCR uses `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` and its downloaded language/worker assets. Optional sharing uses `https://esm.sh/@supabase/supabase-js@2.58.0` and your Supabase server. Without these external services, saved local recipes remain accessible, but OCR and cloud sync may stop.

## Troubleshooting

- **Recipes missing on another device:** Confirm both joined the same household code, confirm online access, then tap **Sync now**. Also check that you're using the same Supabase project URL and publishable key.
- **"Could not connect device":** Verify `Authentication → Sign In / Providers → Anonymous Sign-Ins` is enabled; confirm the project hasn't paused and your publishable key is correct.
- **Supabase says "permission denied":** Re-run the setup in a *new* Supabase project or inspect the SQL Editor for an error. The included SQL should be run once on a new project.
- **OCR doesn't start:** Confirm you're online and reload. You can always retain a photo with manually entered text instead.
- **App won't open offline:** Open it online at least once after publishing. The device may also evict cached files if storage is constrained.
- **App stops after a code update:** Reload the website while online to refresh the app shell, then return to the Home Screen app.
- **Free Supabase project paused:** Resume it in the Supabase dashboard. Exported local backups remain usable without the cloud.
- **Changing hosting URL:** Opening the app on a new domain/path is a different browser storage origin. Import a backup there or connect the same shared collection.

## Security and reliability notes

This is a first-version personal application with private-row access policies but **not a formally security-audited product**. Do not put private health, banking, login, or other highly sensitive data in recipe notes. Do not treat browser storage as a durable backup. For very large collections, consider a native or server-backed architecture and routine incremental exports.
