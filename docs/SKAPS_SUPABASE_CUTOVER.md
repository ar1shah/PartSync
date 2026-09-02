# PartSync -> SKAPS Spare Parts Inventory cutover


## Trial quantity mode

All operational inventory quantities in **SKAPS Spare Parts Inventory** are intentionally locked at `0` during the trial period. The database trigger `trg_enforce_trial_zero_inventory_quantity` forces new or updated inventory records back to zero. Raw Datatex staging quantities remain preserved for reference. Remove or disable this trigger only when SKAPS explicitly moves quantity tracking to live production.

This local build prepares PartSync to use **two Supabase projects** during the
first production migration phase.

## Why two projects temporarily

The existing `skaps-inventory` project is more than an inventory table. It owns
PartSync authentication and operational history:

- Supabase Auth / profiles
- submissions from the Parts Used / Parts Request forms
- notifications and notification read state
- parts-in-repair workflow
- user preferences
- audit log

The new **SKAPS Spare Parts Inventory** project is the authoritative inventory
backend and already owns the richer spare-parts model:

- 9,988 SKAPS master parts
- multi-location inventory records
- main/sub categories
- Datatex QR identifiers (`QR = SKAPS Number`)
- RFID-ready identifiers
- private part images
- flexible technical specifications
- Location Refresh Agent tables/functions
- Part Intelligence Agent tables/context

Replacing the original Supabase URL globally would break Auth and the other
operational features. The cutover therefore uses a dedicated server-side
inventory client.

## Phase-1 architecture

```text
PartSync / Vercel
       |
       +-- Existing Supabase (`skaps-inventory`)
       |      Auth
       |      profiles
       |      submissions
       |      notifications
       |      repairs
       |      preferences
       |      audit log
       |
       +-- New Supabase (`SKAPS Spare Parts Inventory`)
              parts_app_view
              current_inventory_detail
              QR / RFID RPCs
              private images
              technical specifications
              create_skaps_part()
              agent-ready data
```

## Environment variables

Keep the existing PartSync variables unchanged:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INGEST_SECRET`

Add these server-only variables for the new inventory project:

- `SKAPS_INVENTORY_SUPABASE_URL`
- `SKAPS_INVENTORY_SUPABASE_SERVICE_ROLE_KEY`

The URL is:

```text
https://zlezuqshhrqdokieekxe.supabase.co
```

Never expose the new inventory server credential through a `NEXT_PUBLIC_*`
variable. The new inventory project intentionally has RLS enabled with no
browser policies, so current access goes through trusted Next.js server code.

## Local code changes

### Inventory reads

`lib/inventory-backend/load-parts.ts` reads:

- `parts_app_view`
- `current_inventory_detail`

It adapts the richer schema to the existing PartSync tile UI and generates
signed URLs for private images.

Part details now expose:

- SKAPS number
- product name / description
- main and sub-category
- total current quantity
- all inventory locations and per-location quantities
- Zone / Location / Storage Location / LWhsDesc
- QR value
- active RFID tag count
- technical specifications
- private primary image

### Admin new-part creation

The old direct insert into `parts` has been replaced with the server-only RPC:

```text
create_skaps_part()
```

Optional Size + Unit uses:

```text
upsert_part_specification()
```

Existing imported Datatex master records are not directly editable or
hard-deletable from the generic PartSync form.

### QR / RFID lookup and phone camera

A new admin route is available:

```text
/admin/inventory/scan
```

The page supports both manual identifier entry and a rear-camera QR scanner. The
camera reader uses `@zxing/browser`, reads the existing Datatex QR payload,
stops after the first successful decode, and submits the decoded SKAPS value
through the same authenticated server action as manual entry.

It uses:

```text
resolve_part_by_scan_detail()
record_scan_event()
```

Mobile camera access requires a secure browser context. A LAN development URL
such as `http://10.x.x.x:3000` can be used for ordinary page inspection but
mobile browsers normally block camera access there. Test the camera from an
HTTPS Vercel Preview (recommended) or another trusted HTTPS development URL.
The manual scan-value field remains available at all times.

### Google master-list ingest

`POST /api/ingest-master` now returns HTTP `410 Gone` in the cutover build.
The old Athens Inventory Google Sheet is no longer allowed to create/update the
inventory master.

The normal `/api/ingest` route for Parts Used / Parts Request forms remains
active because submissions and request workflows still live in the legacy app
project.

## Quantity safety decision

The old PartSync database had one `current_quantity` per part, so a Parts Used
form could simply subtract from that number.

The new inventory database supports multiple physical locations for one SKAPS
number. The current Parts Used Google Form does **not** tell PartSync which
inventory location supplied the part.

Therefore phase 1 does **not** automatically decrement the new inventory when a
Parts Used form arrives. Doing so would require guessing which location to
change and could corrupt location-level stock.

The used-submission log still resolves SKAPS numbers against the new inventory,
and unmatched numbers are still flagged for review.

Before enabling automatic quantity changes, choose one of these models:

1. Add a storage/location field to the Parts Used form; or
2. Build a scan/issue workflow where the operator scans the exact inventory
   location/tag; or
3. Introduce a quantity transaction ledger with an explicit policy for
   unassigned location adjustments.

`SKAPS_INVENTORY_AUTO_DEDUCT` is included in the environment template but must
remain `false` until the quantity workflow is designed and implemented.

## Production cutover checklist

1. Keep live `main` untouched until a preview passes.
2. Create a Git branch from the current PartSync production commit.
3. Apply these local changes to that branch.
4. Add the two new server-only inventory environment variables in Vercel.
5. Do **not** replace the existing Auth Supabase environment variables.
6. Deploy a Vercel Preview.
7. Verify login and admin authorization still use the old project.
8. Verify `/inventory` loads the full new SKAPS catalog.
9. Verify known image parts (for example DRIVE records) return signed images.
10. Verify a known QR lookup resolves from `/admin/inventory/scan`.
11. Verify Parts Used / Parts Request submissions still arrive in the old
    operational project.
12. Verify `/api/ingest-master` is disabled.
13. Verify no new writes are occurring to the old inventory master tables.
14. Only after acceptance, promote the preview to production.

## What is deliberately not migrated in phase 1

- Supabase Auth
- profiles
- submissions history
- notifications
- repairs
- user preferences
- audit history
- Google Forms request/usage intake

Those can be migrated later as a separate project once the inventory cutover is
stable.
