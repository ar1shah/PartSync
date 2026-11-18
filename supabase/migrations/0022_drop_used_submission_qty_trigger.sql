-- Target project: skaps-inventory (gmivcdjebnqlskabpslg) — auth / submissions.
--
-- Quantity now comes only from the Excel import into SKAPS Spare Parts
-- Inventory. This trigger still subtracted Parts Used submissions from the
-- legacy public.parts table, which the app no longer reads. Submissions are
-- still recorded exactly as before.

drop trigger if exists trg_apply_used_submission on public.submissions;
drop function if exists public.apply_used_submission();
