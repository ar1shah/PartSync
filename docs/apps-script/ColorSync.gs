/**
 * SKAPS Parts Inventory -- Row color sync.
 *
 * Staff manually color rows on the "Maintenance Parts Requests (Responses)"
 * sheet. Two columns are watched:
 *
 *   Column G (Parts Used expense status):
 *     green      -- expensed out
 *     bright red -- not expensed out (needs review)
 *     yellow     -- check inventory / stock balance
 *     pink       -- already shows 0 on Datatex (not tracked in software)
 *
 *   Column H (Parts Request order status):
 *     red        -- not ordered
 *     green      -- ordered
 *     yellow     -- under review
 *     no fill    -- pending
 *
 * This file reads those fill colors and POSTs the mapped statuses to
 * /api/sync-expense-status, which stores them on the matching `submissions`
 * row (matched by the same rowId used by Code.gs). The API writes
 * expense_status only for form_type=used and request_status only for
 * form_type=request.
 *
 * SETUP: See SETUP.md in the same folder. In short:
 *   1. Run logDistinctRowColors() once and adjust COLOR_MAP / REQUEST_COLOR_MAP
 *      below to match the hex codes actually used in your sheet.
 *   2. Run backfillAllRowColors() once to sync existing colored rows.
 *   3. Install the onSheetFormatChange trigger (On change) and the
 *      syncRecentRowColors trigger (time-driven, every 30 minutes).
 *
 * Uses the same ENDPOINT-style Script Properties as Code.gs: STATUS_ENDPOINT
 * and the existing SHARED_SECRET / DEBUG properties.
 */

// ---------------------------------------------------------------------------
// Configuration -- set STATUS_ENDPOINT as a Script Property (see SETUP.md).
// Reuses SHARED_SECRET and DEBUG from Code.gs (same Script Properties store).
// ---------------------------------------------------------------------------
var STATUS_ENDPOINT = PropertiesService.getScriptProperties().getProperty('STATUS_ENDPOINT') || '';

/** Column whose row fill color reflects expense status (G = 7). */
var COLOR_COLUMN = 7;

/** Column whose row fill color reflects parts-request status (H = 8). */
var REQUEST_COLOR_COLUMN = 8;

/**
 * Hex fill color -> expense status. Keys are UPPERCASE hex without '#'.
 * Google Sheets' fill picker can return codes that don't match what you
 * see by eye -- run logDistinctRowColors() against the live sheet and
 * update these to match exactly before relying on this mapping.
 */
var COLOR_MAP = {
  '00FF00': 'expensed',         // green -- expensed out
  '38761D': 'expensed',
  '93C47D': 'expensed',
  'FF0000': 'not_expensed',     // bright red -- needs review
  'CC0000': 'not_expensed',
  'FFFF00': 'check_inventory',  // yellow -- check inventory / stock balance
  'FFD966': 'check_inventory',
  'FF00FF': 'datatex_zero',     // pink -- already 0 on Datatex
  'F4CCCC': 'datatex_zero',
  'EAD1DC': 'datatex_zero',
  'E06666': 'datatex_zero',
  'EA9999': 'datatex_zero',
  '0000FF': 'testing'           // blue -- test rows, not a real expense status
};

/**
 * Hex fill color -> request_status. Blank/uncolored maps to 'pending'.
 * Calibrate against column H with logDistinctRowColors('H').
 */
var REQUEST_COLOR_MAP = {
  'FF0000': 'not_ordered',      // red -- not ordered
  'CC0000': 'not_ordered',
  'E06666': 'not_ordered',
  'EA9999': 'not_ordered',
  '00FF00': 'ordered',          // green -- ordered
  '38761D': 'ordered',
  '93C47D': 'ordered',
  'FFFF00': 'under_review',     // yellow -- under review
  'FFD966': 'under_review',
  'FFF2CC': 'under_review'
};

/** Backgrounds that mean "uncolored" -- never mapped to a status. */
var BLANK_COLORS = ['#FFFFFF', '#ffffff', ''];

/** How many of the most recent rows the timer-based safety net rescans. */
var RECENT_ROW_WINDOW = 400;

/**
 * Earliest row backfillAllRowColors() should touch. The web app only
 * started logging submissions from row 657 onward (June 11, 2026) --
 * anything before that has no matching submission in Supabase, so there's
 * nothing for a color sync to attach to. Adjust this if the ingest
 * start point ever changes.
 */
var BACKFILL_START_ROW = 657;

// ---------------------------------------------------------------------------
// Installable trigger: fires on any spreadsheet change, including manual
// fill-color edits (onEdit does NOT see color-only changes).
// ---------------------------------------------------------------------------
function onSheetFormatChange(e) {
  if (!e || e.changeType !== 'FORMAT') return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getActiveRange();
  if (!range) return;

  var startRow = range.getRow();
  var numRows = range.getNumRows();

  for (var i = 0; i < numRows; i++) {
    var rowNumber = startRow + i;
    if (rowNumber < 2) continue; // skip header
    syncRowColor(sheet, rowNumber);
  }
}

// ---------------------------------------------------------------------------
// Time-driven safety net -- FORMAT change events are known to be missed by
// Google occasionally, so we periodically re-check the most recent rows.
// ---------------------------------------------------------------------------
function syncRecentRowColors() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var startRow = Math.max(2, lastRow - RECENT_ROW_WINDOW + 1);
  Logger.log('syncRecentRowColors: scanning rows ' + startRow + '-' + lastRow);

  for (var rowNumber = startRow; rowNumber <= lastRow; rowNumber++) {
    syncRowColor(sheet, rowNumber);
  }
}

// ---------------------------------------------------------------------------
// One-time backfill -- syncs every colored/request row in the sheet. Can take
// a while on a large sheet; run manually once, ideally off-hours.
// ---------------------------------------------------------------------------
function backfillAllRowColors() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Sheet has no data rows yet.');
    return;
  }

  var startRow = Math.max(2, BACKFILL_START_ROW);
  if (startRow > lastRow) {
    Logger.log('BACKFILL_START_ROW (' + BACKFILL_START_ROW + ') is past the last row (' + lastRow + ') -- nothing to do.');
    return;
  }

  Logger.log('backfillAllRowColors: scanning rows ' + startRow + '-' + lastRow + ' (columns G + H)...');
  var synced = 0;
  for (var rowNumber = startRow; rowNumber <= lastRow; rowNumber++) {
    syncRowColor(sheet, rowNumber);
    synced++;
  }
  Logger.log('backfillAllRowColors: done. Synced ' + synced + ' rows out of ' + (lastRow - startRow + 1) + ' scanned.');
}

// ---------------------------------------------------------------------------
// Calibration helper -- run once against the live sheet and check the
// Executions log to see every distinct fill color. Pass 'G' or 'H' (default G).
// Colors already in the matching map are marked "mapped"; add any "UNMAPPED".
// ---------------------------------------------------------------------------
function logDistinctRowColors(columnLetter) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Sheet has no data rows yet.');
    return;
  }

  var letter = (columnLetter || 'G').toString().toUpperCase();
  var column = letter === 'H' ? REQUEST_COLOR_COLUMN : COLOR_COLUMN;
  var map = letter === 'H' ? REQUEST_COLOR_MAP : COLOR_MAP;

  var backgrounds = sheet.getRange(2, column, lastRow - 1, 1).getBackgrounds();
  var seen = {};
  for (var i = 0; i < backgrounds.length; i++) {
    var color = backgrounds[i][0];
    if (isBlank(color)) continue;
    var key = color.toUpperCase();
    if (!seen[key]) {
      seen[key] = { count: 0, exampleRow: i + 2 };
    }
    seen[key].count++;
  }

  Logger.log('Distinct non-blank colors in column ' + letter + ':');
  var unmapped = 0;
  for (var hex in seen) {
    var mapKey = hex.replace('#', '').toUpperCase();
    var status = map[mapKey];
    var tag = status ? 'mapped -> ' + status : 'UNMAPPED -- add to map';
    if (!status) unmapped++;
    Logger.log(hex + '  (x' + seen[hex].count + ', e.g. row ' + seen[hex].exampleRow + ')  ' + tag);
  }
  if (unmapped === 0) {
    Logger.log('All colors above are mapped. You can run backfillAllRowColors().');
  } else {
    Logger.log(unmapped + ' unmapped color(s) -- add them to the map (hex without #).');
  }
}

// ---------------------------------------------------------------------------
// Core: detect expense + request status from fill colors and POST them.
// ---------------------------------------------------------------------------
function syncRowColor(sheet, rowNumber) {
  var expenseStatus = detectMappedStatus(sheet, rowNumber, COLOR_COLUMN, COLOR_MAP);
  var requestStatus = detectMappedStatus(sheet, rowNumber, REQUEST_COLOR_COLUMN, REQUEST_COLOR_MAP);
  // Blank request highlight means pending (explicitly sent, not skipped).
  if (!requestStatus) requestStatus = 'pending';

  var rowId = 'sheet-' + sheet.getSheetId() + '-row-' + rowNumber;

  if (DEBUG) {
    Logger.log(
      'syncRowColor: ' + rowId +
      ' expense=' + (expenseStatus || 'null') +
      ' request=' + requestStatus
    );
  }

  postColorStatus(rowId, expenseStatus, requestStatus);
}

function detectMappedStatus(sheet, rowNumber, column, map) {
  var color = sheet.getRange(rowNumber, column).getBackground();
  if (isBlank(color)) return null;

  var key = color.replace('#', '').toUpperCase();
  var status = map[key];
  if (!status && DEBUG) {
    Logger.log('Unmapped row color ' + color + ' on row ' + rowNumber + ' col ' + column + ' -- add it to the map.');
  }
  return status || null;
}

function isBlank(color) {
  if (!color) return true;
  for (var i = 0; i < BLANK_COLORS.length; i++) {
    if (color.toUpperCase() === BLANK_COLORS[i].toUpperCase()) return true;
  }
  return false;
}

function postColorStatus(rowId, expenseStatus, requestStatus) {
  if (!STATUS_ENDPOINT) {
    Logger.log('ERROR: STATUS_ENDPOINT is not set. See SETUP.md.');
    return;
  }
  if (!SHARED_SECRET) {
    Logger.log('ERROR: SHARED_SECRET is not set. See SETUP.md.');
    return;
  }

  try {
    var response = UrlFetchApp.fetch(STATUS_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-skaps-secret': SHARED_SECRET },
      payload: JSON.stringify({
        rowId: rowId,
        expenseStatus: expenseStatus,
        requestStatus: requestStatus
      }),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log('sync-expense-status returned ' + code + ' for ' + rowId + ': ' + response.getContentText());
    } else if (DEBUG) {
      Logger.log('sync-expense-status OK for ' + rowId + ': ' + response.getContentText());
    }
  } catch (err) {
    Logger.log('sync-expense-status fetch error for ' + rowId + ': ' + err);
  }
}
