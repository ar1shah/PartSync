> **Deprecated for the SKAPS inventory cutover:** `/api/ingest-master` is intentionally disabled in the dual-Supabase build. The Athens master sheet must not write inventory after SKAPS Spare Parts Inventory becomes authoritative. Keep this document only as historical reference.

# Master List Apps Script Setup

This guide explains how to connect the "Athens Inventory 2026" Google Sheet to the
`/api/ingest-master` endpoint so that new rows added manually by a user are
automatically synced to the Supabase parts database.

---

## What it does

When a user types a new SKAPS number into **column A** of any of the 13 master-list
sheets (PLC_CARDS, MOTORS, GEARMOTORS, etc.), the script fires and sends the full
row to your Next.js app. The app then upserts the part into the `parts` table with
`current_quantity = 0` (existing parts keep their current stock level).

---

## Step 1 — Open the Apps Script editor

1. Open the **Athens Inventory 2026** Google Sheet.
2. In the menu bar click **Extensions → Apps Script**.
3. A new tab opens showing the script editor.

---

## Step 2 — Paste the script

1. Delete any existing code in the editor (the default `myFunction` stub).
2. Open `docs/apps-script/MasterListCode.gs` from this repository and copy its
   entire contents.
3. Paste it into the Apps Script editor.
4. Click **Save** (floppy disk icon) or press `Ctrl+S` / `Cmd+S`.

---

## Step 3 — Set Script Properties

Script Properties store your secrets outside the code so they aren't visible in
version history.

1. In the Apps Script editor, click the **gear icon (⚙)** → **Project settings**.
2. Scroll down to **Script Properties** and click **Add script property** for each:

| Property name     | Value |
|-------------------|-------|
| `MASTER_ENDPOINT` | `https://your-app.vercel.app/api/ingest-master` |
| `SHARED_SECRET`   | The same value as your `INGEST_SECRET` environment variable |
| `DEBUG`           | `false` (set to `true` temporarily if you need verbose logs) |

> **Where to find INGEST_SECRET:** Check your Vercel project's environment
> variables, or your local `.env.local` file (`INGEST_SECRET=...`).

---

## Step 4 — Install the trigger

1. In the Apps Script editor, click the **clock icon (Triggers)** in the left sidebar
   (or go to **Edit → Current project's triggers**).
2. Click **+ Add Trigger** (bottom right).
3. Configure:
   - **Choose which function to run:** `onMasterListEdit`
   - **Choose which deployment to run as:** `Head`
   - **Select event source:** `From spreadsheet`
   - **Select event type:** `On edit`
4. Click **Save**.
5. Google will ask you to authorize the script — follow the prompts and grant access.

> **Note:** The trigger type is **On edit** (not "On change" or "On form submit").
> It fires whenever any cell in the spreadsheet is edited.

---

## Step 5 — Test it

1. In the Apps Script editor, select the function **`manualTestMaster`** from the
   dropdown next to the Run button.
2. Make sure you are currently viewing one of the 13 data sheets in the spreadsheet
   (e.g., open the **MOTORS** tab).
3. Click **Run**.
4. Open **View → Logs** to see the output.
5. In your admin panel go to **Notifications** — you should see a confirmation that
   the row was received (or an error if something is misconfigured).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `MASTER_ENDPOINT is not set` in logs | Script property not saved | Re-check Step 3 |
| HTTP 401 in logs | Wrong `SHARED_SECRET` | Match it exactly to `INGEST_SECRET` |
| Trigger doesn't fire | Wrong trigger type | Must be "On edit", not "On change" |
| Rows in Export/CATEGORY_SUB_LIST sheet trigger the script | Expected — the script silently ignores those sheets | No action needed |
| New row doesn't appear in inventory | SKAPSNo column (A) was left blank | Ensure column A is filled first |

---

## How new rows flow in

```
User types SKAPSNo in column A
        ↓
onMasterListEdit fires
        ↓
Reads full row headers + values
        ↓
POST /api/ingest-master  (x-skaps-secret header)
        ↓
Supabase parts table upserted (qty = 0 for new, preserved for existing)
        ↓
Appears in /inventory tile grid
```

---

## Existing data (one-time import)

The initial import of all ~1,584 parts from the Excel file is handled separately
by the seed script:

```bash
pnpm tsx supabase/seed/import_master_list.ts "C:/path/to/Athens Inventory 2026.xlsx"
```

The Apps Script only handles **new rows** added after the initial import.
