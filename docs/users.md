# Kaybee — How to Use It

Kaybee is Loop's internal library. It mirrors everything in a specific Google Shared Drive and turns it into a fast, searchable site. You don't write content in Kaybee — you write it in Google Docs (or Slides, Sheets, Forms) as normal. Kaybee just makes it easier to find and read.

The site address depends on the deploy. Ask your admin if you don't have a link.

---

## Adding a document

1. Open the Shared Drive that Kaybee is wired to.
2. Create or move your Google Doc/Slides/Sheets/Form into a folder inside it.
3. Wait ~10 seconds. The doc appears on the home page and inside its folder's category.

You don't need to publish or share anything extra — if it's in the Drive, Kaybee will pick it up. If you delete it from Drive, it leaves Kaybee on the next sweep.

> If a doc isn't appearing after a minute or two, ask your admin to run `/reindex` — that's a one-button rescan.

---

## Folders become categories

Whatever folder your doc lives in becomes its category. Nested folders become nested categories (`Operations / Runbooks / On-call`).

A few rules of thumb:

- The Shared Drive itself is **not** a category. Top-level folders inside it are.
- Folder names show up exactly as written. Use Title Case and avoid abbreviations.
- Moving a doc to a different folder updates its category automatically.

Browse all categories at `/cat/` (the **Categories** link in the header).

---

## Tags

Write `#anything` inside the body of a doc and it becomes a tag. Tags work alongside categories — a doc can live in one folder but carry several tags.

- `#hr`, `#onboarding`, `#runbook` — short, lowercase, no spaces.
- Tags ignore the `#` in headings (`# My Doc Title` is a heading, not a tag).
- Click a tag anywhere on the site to see every doc that uses it.

---

## Search

The search box in the header matches words in document titles. It's deliberately simple — one box, instant results.

- Search is case-insensitive.
- It matches whole words, not partial matches. ("runb" won't find "Runbook"; "runbook" will.)
- Search currently doesn't look inside doc bodies. If you need to find something by body text, open it in Drive and use Drive's search there.

---

## Calendar

If your deploy has `CALENDAR_IDS` configured, the **Calendar** link in the header shows the next two weeks of events from those calendars. Click any event to open it in Google Calendar.

To add a new calendar to Kaybee, share it with the service account email at least as **See all event details**, then ask your admin to add the calendar ID to the `CALENDAR_IDS` environment variable.

---

## The reader

Clicking a doc card opens it inside Kaybee with the formatting cleaned up for fast reading. The orange button in the top-right (**Open in Docs / Slides / Sheets / Form**) takes you to the original file in Drive when you want to edit or comment.

Images embedded in the doc are mirrored into Kaybee automatically — you don't need to do anything special for pictures or screenshots.

---

## What renders, what doesn't

| Drive file type | In Kaybee |
|---|---|
| Google Doc | Full Markdown render, images included |
| Google Slides | Text-only outline (open in Slides for the visual deck) |
| Google Sheet | Text-only summary (open in Sheets for the live grid) |
| Google Form | Link-only card — opens the form in Google Forms |
| Anything else (PDFs, Word, Excel, images) | Not synced |

If you have a non-Google file you want indexed, convert it to a Google Doc first (right-click → *Open with → Google Docs*).

---

## Common questions

**Why isn't my doc showing?**
Three things to check, in order:

1. Is it in the right Shared Drive? Kaybee only watches one drive.
2. Is it a supported file type? (See the table above.)
3. Has it been more than a minute? If yes, ask your admin to run `/reindex`.

**Can I make a doc private?**
No. Anything in the Shared Drive is visible to anyone with access to Kaybee. For private content, keep it out of the Drive.

**Can I edit a doc from inside Kaybee?**
No — Kaybee is read-only. Click the orange "Open in …" button on any doc page to edit it in Drive. Changes appear back in Kaybee within ~10 seconds of saving.

**The home page title is wrong.**
The big title in the home hero comes from the `SHARED_DRIVE_NAME` environment variable. Your admin can change it without touching code — it takes effect on the next deploy.
