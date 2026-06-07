/**
 * ============================================================================
 * Files.gs — Google Drive receipt file organization (§2.12, §3.3f, §3.4e)
 * ============================================================================
 * Best-effort rename + foldering of receipt files. Callers MUST wrap these in
 * try-catch: a file-op failure NEVER blocks the underlying data operation
 * (§3.3f) — it is logged via logFileError and processing continues.
 * ES5-compatible.
 * ============================================================================
 */

/** Root folder for receipts from the Receipts Root Folder ID setting, or null. */
function getReceiptRootFolder_() {
  var id = String(getSettingValue('Receipts Root Folder ID') || '').trim();
  if (!id) { return null; }
  try { return DriveApp.getFolderById(id); } catch (e) { return null; }
}

/** Find or create a child folder by name. */
function getOrCreateFolder_(parent, name) {
  var safe = String(name || 'Unspecified').replace(/[\\/]/g, '-').trim() || 'Unspecified';
  var it = parent.getFoldersByName(safe);
  return it.hasNext() ? it.next() : parent.createFolder(safe);
}

/** Map the "Date Format in Filenames" setting to a Utilities pattern. */
function _fileDatePattern_() {
  var s = String(getSettingValue('Date Format in Filenames') || 'YYYY-MM-DD');
  if (s === 'MM-DD-YYYY') { return 'MM-dd-yyyy'; }
  if (s === 'DD-MM-YYYY') { return 'dd-MM-yyyy'; }
  return 'yyyy-MM-dd';
}

/** Standardized receipt file name (no extension change). */
function buildReceiptFileName_(ctx) {
  var datePart = ctx.purchaseDate ? formatDate(ctx.purchaseDate, _fileDatePattern_()) : 'nodate';
  var bits = [datePart, ctx.vendor || 'Vendor', ctx.fullName || 'Name', ctx.rowId || ''];
  var name = bits.join(' - ').replace(/\s+/g, ' ').trim();
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

/**
 * Resolve the destination folder for a NEW receipt per Organize-by-Folders mode.
 * Returns null if no root is configured (caller then skips the move).
 */
function destinationFolderForNew_(root, ctx) {
  if (!root) { return null; }
  var mode = String(getSettingValue('Organize by Folders') || 'By Fiscal Year then Event');
  switch (mode) {
    case 'Flat (all in root)':        return root;
    case 'By Fiscal Year':            return getOrCreateFolder_(root, ctx.fyLabel);
    case 'By Event/Project':          return getOrCreateFolder_(root, ctx.project || 'Unassigned');
    case 'By Status':                 return getOrCreateFolder_(root, 'Pending');
    case 'By Fiscal Year then Event':
    default:
      return getOrCreateFolder_(getOrCreateFolder_(root, ctx.fyLabel), ctx.project || 'Unassigned');
  }
}

/**
 * Rename and move a newly submitted receipt file. Throws on failure so the
 * caller can log FILE_ERROR and continue (§3.3f).
 */
function organizeNewReceipt_(fileId, ctx) {
  if (!fileId) { return; }
  var file = DriveApp.getFileById(fileId);
  var ext = '';
  var orig = file.getName();
  var dot = orig.lastIndexOf('.');
  if (dot > -1) { ext = orig.substring(dot); }
  file.setName(buildReceiptFileName_(ctx) + ext);

  var root = getReceiptRootFolder_();
  var dest = destinationFolderForNew_(root, ctx);
  if (dest) { file.moveTo(dest); }
}

/**
 * Move a receipt file into a status-named folder under root (Approved / Paid /
 * Rejected / Pending). Throws on failure (caller logs + continues, §3.4e).
 */
function moveReceiptToStatusFolder_(fileId, statusFolderName) {
  if (!fileId) { return; }
  var root = getReceiptRootFolder_();
  if (!root) { return; }
  var dest = getOrCreateFolder_(root, statusFolderName);
  DriveApp.getFileById(fileId).moveTo(dest);
}

/** Map a Reimbursement Status to its Drive status folder name (§3.4e). */
function statusFolderForReimbStatus_(status) {
  var s = String(status || '');
  if (s === 'Reimbursed' || s === 'Payment Received') { return 'Paid'; }
  if (s === 'Rejected / Cancelled') { return 'Rejected'; }
  if (s === 'Approved' || s === 'CR Draft' || s === 'CR Ready to Submit') { return 'Approved'; }
  return 'Pending';
}
