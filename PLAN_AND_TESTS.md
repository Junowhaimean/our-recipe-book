# Product plan and verification

## Purpose

Reduce recipe screenshots in Apple Photos while giving a couple the same searchable, editable collection on multiple devices, without a paid recipe-app subscription or lock-in.

## Delivery architecture

| Component | Design | Ownership / portability |
|---|---|---|
| Interface | Plain HTML, CSS, JavaScript PWA | Source files stay yours |
| Offline data | IndexedDB on each device | JSON export contains entries and images |
| Hosting | Static HTTPS, e.g. GitHub Pages | Move files to another static host |
| Cloud sharing | Optional Supabase Free project | Household tables + private image bucket, SQL included |
| Authentication | Anonymous per-device sign-in | No email service or passwords required inside app; invitation code joins private household |
| OCR | Optional on-device Tesseract.js | No paid AI API, but code/language downloads need network |

## Release 1: implemented

- Recipe CRUD, categories, three statuses, free-text search
- One photo per recipe, resized before local save
- Source URL, ingredients, instructions, notes, servings, cooking/prep time
- Best-effort OCR
- Offline local access, PWA install manifest
- Export/restore portable JSON including images
- Household joining with unique code and RLS-protected cloud sync
- Soft deletes and basic last-edit-wins merge

## Suggested later releases

1. Import several screenshots per recipe and merge OCR across pages.
2. Offline-first queue indicator and an explicit "unsynced recipes" count; improve conflict resolution and revision history.
3. Remove/revoke individual devices from household.
4. Optional automatic backup reminders and periodic backup to user-owned files or storage.
5. Ingredient scaling, shopping lists, meal planning, ratings and tags.
6. More advanced webpage imports when a page allows recipe-schema scraping, without violating access controls.
7. Native iOS app option if camera/share-sheet integration becomes important.

## Manual acceptance checklist (run on real devices before deleting originals)

- [ ] Add a recipe, quit the app, reopen it, and confirm it persists.
- [ ] Upload a screenshot, confirm the image displays, edit the recipe, and check it remains attached.
- [ ] Try OCR on a recipe screenshot; verify all quantities by hand.
- [ ] Search for an ingredient; filter a category; mark a favorite.
- [ ] Export JSON and verify the file was actually saved outside the app.
- [ ] Restore that JSON on a separate browser/device and check the image and notes.
- [ ] Create a household via Supabase; join with a second device.
- [ ] Add a recipe on device A, sync on device B, and confirm it appears with the image.
- [ ] Edit on device B, sync device A, and confirm the edit appears.
- [ ] Turn off Wi-Fi, reopen the installed app, read a recipe, and edit it offline.
- [ ] Turn Wi-Fi back on and sync both devices to confirm the edit appears.
- [ ] Delete a test recipe, sync both devices, and confirm it disappears.
- [ ] Rotate the invitation code and confirm the new code joins a third device.

## Verification performed in this package

- JavaScript syntax checked with Node.js 22.
- Manifest file and zipped package validated.
- No live Supabase project was created or connected during authoring.
- Browser-based automated integration testing was unavailable in the development environment due to browser navigation policy; **the manual acceptance checklist above is still required.**
