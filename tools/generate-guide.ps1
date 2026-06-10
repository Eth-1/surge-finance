# Generates the Finance Coordinator Onboarding Guide .docx (no node/python needed).
# Run:  powershell -File tools/generate-guide.ps1   (writes the .docx to the repo root)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $repoRoot 'Surge Finance - Coordinator Onboarding Guide.docx'

# ---------- helpers ----------
function Esc([string]$t) { $t -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;' }
function Run([string]$t,[bool]$bold=$false) {
  $rpr = if ($bold) { '<w:rPr><w:b/></w:rPr>' } else { '' }
  '<w:r>' + $rpr + '<w:t xml:space="preserve">' + (Esc $t) + '</w:t></w:r>'
}
function Para([string]$t,[bool]$bold=$false) { '<w:p>' + (Run $t $bold) + '</w:p>' }
function Heading([string]$t,[int]$lvl) {
  '<w:p><w:pPr><w:pStyle w:val="Heading' + $lvl + '"/></w:pPr>' + (Run $t) + '</w:p>'
}
function TitlePara([string]$t) { '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>' + (Run $t) + '</w:p>' }
function SubTitle([string]$t) { '<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr>' + (Run $t) + '</w:p>' }
function Bullet([string]$t) {
  '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' + (Run $t) + '</w:p>'
}
function NumItem([string]$t,[int]$numId) {
  '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + $numId + '"/></w:numPr></w:pPr>' + (Run $t) + '</w:p>'
}
function CellPara([string]$t,[bool]$bold=$false) {
  '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/></w:pPr>' + (Run $t $bold) + '</w:p>'
}
function Cell([string]$t,[int]$w,[bool]$header=$false) {
  $shade = if ($header) { '<w:shd w:val="clear" w:color="auto" w:fill="E7ECF7"/>' } else { '' }
  '<w:tc><w:tcPr><w:tcW w:w="' + $w + '" w:type="dxa"/>' + $shade + '</w:tcPr>' + (CellPara $t $header) + '</w:tc>'
}
function TableXml([int[]]$widths,[string[]]$header,[System.Collections.IEnumerable]$rows) {
  $total = ($widths | Measure-Object -Sum).Sum
  $grid = ($widths | ForEach-Object { '<w:gridCol w:w="' + $_ + '"/>' }) -join ''
  $b = '<w:tblBorders>' +
       '<w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
       '<w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
       '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
       '<w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
       '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>' +
       '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/></w:tblBorders>'
  $cm = '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>'
  $tbl = '<w:tbl><w:tblPr><w:tblW w:w="' + $total + '" w:type="dxa"/>' + $b + $cm + '<w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>' + $grid + '</w:tblGrid>'
  # header row
  $hc = ''
  for ($i=0; $i -lt $header.Count; $i++) { $hc += (Cell $header[$i] $widths[$i] $true) }
  $tbl += '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + $hc + '</w:tr>'
  foreach ($row in $rows) {
    $rc = ''
    for ($i=0; $i -lt $row.Count; $i++) { $rc += (Cell ([string]$row[$i]) $widths[$i] $false) }
    $tbl += '<w:tr>' + $rc + '</w:tr>'
  }
  $tbl += '</w:tbl><w:p/>'
  $tbl
}

# ---------- content (markup parsed below) ----------
$content = @'
T:Surge Finance
SUB:Finance Coordinator Onboarding Guide
P:This guide explains how the reimbursement system works end to end so a new coordinator can run it confidently. Keep it open while you learn; everything here is doable without writing code.
H1:1. The 60-second overview
P:Surge Finance has two halves that work together:
*:The engine - a Google Sheet with built-in automation (Apps Script). This is where all the data lives and where you do your work, using the special menu. Members never see it.
*:The website - a read-only dashboard hosted free on Vercel. Members use it to submit forms and track their reimbursement; you use it to read club finances, run reports, and check year-end readiness. It only displays data - it never changes anything.
P:Golden rule: you make changes in the Google Sheet; the website just reflects them within a few minutes.
H1:2. Who uses what
TBL:2200,7160
R:Person~~What they do
R:Club member~~Submits a receipt or mileage Google Form, then checks status on the public website by entering their email. No login.
R:Finance Coordinator (you)~~Reviews submissions, approves, moves them to Expenses, groups them into cheque requisitions, records payments. Works in the Sheet.
R:Finance Director~~Everything a Coordinator does, plus the sensitive actions: cancelling a cheque requisition, editing Settings, and running the year-end rollover.
TBLEND
H1:3. The reimbursement lifecycle
P:This is the core flow. Most of your job is moving items along it.
#:Submit - a member fills the Receipt or Mileage Google Form (with a photo of the receipt). A new row appears automatically in the Approval Queue (receipts) or Mileage Approvals.
#:Review and approve - you check the submission, assign a Project and Category, and approve it. Mileage just needs one approval.
#:Move to Expenses - once approved, you move the row into the Expenses ledger (the official record). The member is now "Approved".
#:Group into a Cheque Requisition (CR) - you bundle one or more approved expenses into a CR addressed to the SFSS, allocate funding sources, and submit it.
#:SFSS processes - you advance the CR status as the SFSS reviews it. Each status change automatically updates every linked expense (and the member's tracker).
#:Cheque received and distributed - when the cheque arrives you mark it received, then distribute payment to members. The expense becomes "Reimbursed".
#:Reconcile - the Reconciliation sheet checks that the money received matches what was expected, and that everyone was paid.
P:Direct path: mileage and small out-of-pocket items can skip the CR and be paid straight from the club bank account - approve, move to Expenses, mark Reimbursed.
H1:4. The sheets (your workspace)
P:Tabs are colour-coded: blue = data from the form, green = fields you fill in, grey = automatic/system. Hidden helper columns exist on the right of some sheets - leave them alone.
TBL:2600,6760
R:Sheet~~What it is for
R:Settings~~All configuration: dashboard password, name lists, dropdown options (events, categories, funding sources), and thresholds. Edit freely - no redeploy needed.
R:Approval Queue~~Incoming receipt submissions awaiting your dual approval (Coordinator + Director).
R:Mileage Approvals~~Incoming driving claims; single approval; auto-calculates payout from distance x rate.
R:Expenses~~The unified ledger of everything approved. The source of truth for budgets, grants, reports, and reimbursements.
R:CR Tracker~~Cheque Requisitions sent to the SFSS, with status, totals, and per-funding-source allocations.
R:Grants~~Grant applications and how much of each grant has been spent.
R:Budgets~~Per-project budgets with spent / committed / remaining and a health bar.
R:Loans~~Money members lent the club (e.g. a large expense on a personal card). Status, IDs and overdue flags are automatic; repayments are typed into Amount Repaid.
R:Reconciliation~~Two sections: cheque reconciliation (expected vs received) and the payment distribution log.
R:Audit Log~~An automatic, tamper-resistant record of every action. Read-only.
R:Dashboard Data / Archive~~System tabs: the website cache, and storage for archived prior-year records. Do not edit by hand.
TBLEND
H1:5. The Surge Finance menu
P:Open the Sheet and use the bolt menu at the top: Extensions are standard Google; your actions live under the custom menu labelled with a lightning bolt. The label shows how many items are ready to move.
TBL:3000,4180,2180
R:Action~~What it does~~Who
R:Move to Expenses~~Moves the selected fully-approved row(s) into Expenses. Shows a budget-impact preview first.~~Coordinator
R:Move All / Move Selected~~Batch version; skips rows missing a Project or Category and tells you why.~~Coordinator
R:Create Cheque Requisition~~Groups the selected Approved expenses into a new CR.~~Coordinator
R:Cancel CR~~Cancels a CR and reverts its expenses to Approved.~~Director only
R:Undo Move to Expenses~~Sends an expense back to the Approval Queue (only if untouched).~~Director only
R:Delete Selected Expense~~Deletes an expense with a confirmation showing CR impact.~~Coordinator
R:Refresh Dashboard Data~~Forces the website cache to recompute now.~~Coordinator
R:Apply Rich Formatting~~Re-applies the colour-coding rules to every sheet (safe anytime).~~Coordinator
R:Year-End Rollover / Archive Prior Years~~Closes the fiscal year and archives old records.~~Director only
TBLEND
H1:6. Day-to-day workflows
H2:6.1 Approve and move a receipt
#:Open the Approval Queue. New rows are at the top.
#:Check the receipt (click the View Receipt link), the amount, and the vendor.
#:Set Coordinator Approval (your name) in column O. In Sequential mode the Director approves in column P after you.
#:Fill the green review columns: Standardized Project, Assigned Category, and Verified Amount (only if the amount needs correcting - otherwise the submitted amount is used).
#:When the Approval Status shows Fully Approved, select the row and run Surge Finance > Move to Expenses. Confirm the budget preview.
P:Approval modes (set in Settings > Approval Mode): Sequential (Coordinator then Director - default), Both Required, or Independent. Either approver typing "Rejected" rejects the item.
H2:6.2 Mileage
#:Open Mileage Approvals. Payout is already calculated (distance x rate).
#:Set Status to Approved (or Rejected) in column L. Your name and the date fill in automatically.
#:On Approved, the row is moved to Expenses automatically as an E-Transfer from the club account - no CR needed.
H2:6.3 Create a Cheque Requisition
#:In Expenses, select the Approved rows you want to claim (hold Ctrl/Cmd to pick several).
#:Run Surge Finance > Create Cheque Requisition. A new CR appears in CR Tracker with a number like CR-2526-001.
#:In CR Tracker, fill the FS: columns to allocate the total across funding sources. The Funding Total Check must say Match before you can submit.
#:Set Delivery Method, Submitted By, and a Date Submitted.
H2:6.4 Advance the CR through the SFSS
P:Change the CR Status (column H) as things progress. Each change cascades to every linked expense and the member's tracker automatically:
TBL:3680,5680
R:Set CR status to...~~...and linked expenses become
R:Ready to Submit / Submitted~~CR Ready / CR Submitted (blocked if funding does not match)
R:Follow Up / Action Required~~Follow Up Required / Action Required
R:Approved by SFSS~~Awaiting Payment
R:Cheque Received~~Payment Received (payment date auto-filled)
R:Distributed~~Reimbursed
R:Cancelled~~Reverts to Approved and clears the CR number (Director only)
TBLEND
P:Follow Up = you are chasing the SFSS. Action Required = the SFSS is waiting on you (missing info/forms).
H2:6.5 Reconcile a cheque
#:When a cheque arrives, the Reconciliation sheet (section 1) shows Expected vs Actual received.
#:Enter the Actual Amount Received. If it differs, record a Supplementary Source/Amount to cover the gap.
#:The Coverage Flag confirms the full amount is covered; the Payment Distribution section (lower down) logs who was paid, generated automatically as expenses are reimbursed.
H2:6.6 Paying someone before the SFSS pays the club (personal advance)
P:Sometimes a member needs the money before the SFSS reimburses the club, so you pay them yourself.
#:In Expenses, set Payment Method to "E-Transfer (via Finance Director)" and Reimbursement Status to Reimbursed - the member is now paid.
#:In the Advanced By column (far right), type your name (whoever fronted the money).
#:The dashboard now shows a Personal Advances card with what the club owes you. It clears automatically once the linked CR is Distributed (the SFSS has repaid the club), or when you blank out Advanced By after being repaid.
H2:6.7 Recording a member loan (someone lends the club money)
P:The opposite case: a member fronts money FOR the club (e.g. a big deposit on their credit card) and must be paid back.
#:Open the Loans tab and add a row: Lender Name, Date Received, Amount, Purpose. The Loan ID and Status (Open) fill in automatically.
#:Optional: put the matching CR number in Linked CR # - when that CR is Distributed, the system reminds you to repay them. A Due Date adds an overdue warning.
#:When you repay (fully or partially), type the running total into Amount Repaid. Status flips to Partially Repaid / Repaid and Date Repaid fills itself.
#:The dashboard "Liabilities - owed to people" card shows loans and advances together, and Year-End will not pass until all loans are Repaid.
H2:6.8 Rejecting a submission
P:Type a reason in the Rejection Reason column (or set an approver to "Rejected"). The status becomes Rejected and the member sees the reason on their status page. Clearing the reason reverts it.
H2:6.9 Fixing mistakes
*:Unlink an expense from a CR - clear its Cheque Requisition # cell. It returns to Approved and the CR total recalculates. (Blocked once the cheque is received.)
*:Undo a move - Surge Finance > Undo Move to Expenses sends it back to the Approval Queue (Director only; only if no CR yet).
*:Delete - use Delete Selected Expense so you get the confirmation and the CR recalculates.
H2:6.10 Year-end rollover
#:Open the Year-End page on the website to see what is left (open CRs, unpaid balances, open grants, non-closed budgets, pending items, unpaid member loans).
#:Resolve each item until the checklist is all green.
#:The Director runs Surge Finance > Year-End Rollover. With archiving enabled, fully-settled prior-year rows are safely copied to the Archive (copy-verify-then-delete - never lossy). Reports still include archived years.
H1:7. The website (read-only)
TBL:2200,7160
R:Page~~What it shows
R:Status (public)~~Members enter their email to see their submissions, a progress tracker, and the FAQ. Also has the Submit Receipt / Submit Mileage buttons.
R:Dashboard~~KPIs, charts, "Needs attention" alerts, the reimbursement funnel, recent activity, and outstanding personal advances. Fiscal-year selector top-right.
R:Submissions~~Every submission with search, filters (status/type/project/date/amount), sortable columns, and CSV export.
R:Reports~~Monthly, Event, Grant, Term, or Year-End summaries; print to PDF or export CSV.
R:Year-End~~The readiness checklist described above.
TBLEND
P:All finance pages share one password (Settings > Dashboard Password). Members never need it. Press Ctrl/Cmd+K anywhere in the console for a quick command menu.
H1:8. Settings and configuration (no code)
P:Everything below is edited in the Settings tab and takes effect automatically - no redeploy.
*:Add an event, category, or funding source - type it in the next blank cell under the matching LIST: block. It appears in dropdowns and on the website.
*:Change the dashboard password - edit the Dashboard Password value.
*:Who counts as Director/Coordinator - put their email addresses in the DirectorNames / CoordinatorNames lists (emails, so the system can recognise the signed-in user).
*:Tune behaviour - thresholds for budgets/grants/follow-ups, the mileage rate, fiscal-year start, and CR numbering all live in the key/value section with descriptions.
H1:9. Roles and permissions
TBL:5080,2140,2140
R:Action~~Coordinator~~Director
R:Approve, assign project/category, move to Expenses~~Yes~~Yes
R:Create a Cheque Requisition~~Yes~~Yes
R:Cancel a CR~~No~~Yes
R:Undo a move to Expenses~~No~~Yes
R:Edit Settings~~No~~Yes
R:Run Year-End Rollover / Archive~~No~~Yes
TBLEND
P:Roles are recognised by matching the signed-in Google account's email to the name lists in Settings.
H1:10. Status glossary
H2:Approval Queue (receipts)
P:Pending -> Coordinator Approved / Director Approved -> Fully Approved -> Moved to Expenses. "Rejected" is terminal but reversible by clearing the reason.
H2:Reimbursement status (Expenses)
P:Approved -> CR Draft -> CR Submitted -> Awaiting Payment -> Payment Received -> Reimbursed. Plus Follow Up Required, Action Required, and Rejected / Cancelled.
H2:CR status
P:Draft -> Ready to Submit -> Submitted -> (Follow Up / Action Required) -> Approved by SFSS -> Cheque Received -> Distributed. Plus Cancelled.
H2:Grant and budget status
P:Grants: Applied, Under Review, Approved, Partially Approved, Appealed, Appeal Approved, Denied. Budgets: Planning, Active, Over Budget, Closed (status auto-updates from spending).
H1:11. Tips and troubleshooting
*:You cannot move a receipt to Expenses without a Project and Category - the system blocks it so charts and budgets stay accurate.
*:A CR will not submit if the funding allocation does not equal the total - fix the FS: columns first.
*:Edits in the Sheet appear on the website within about 3-5 minutes (or seconds for important changes). Use Refresh Dashboard Data to force it.
*:Website shows old data or a "cannot connect" banner - it is serving cached data; check back shortly or press Retry.
*:"This form is no longer accepting responses / Fix file upload settings" - this is a Google Forms/Drive issue (usually the form owner's Drive storage is full, or the file-responses folder was trashed), not the Sheet. See SETUP.md troubleshooting.
*:Never delete the form's "(File responses)" Drive folder, and never hand-edit grey/system columns or the Audit Log.
*:When in doubt, the Audit Log shows who did what and when.
P:For installation and deployment, see SETUP.md. For a feature/route map, see README.md.
'@

# ---------- parse markup into body ----------
$parts = New-Object System.Collections.Generic.List[string]
$nextNum = 2
$curNum = 2
$prevWasNum = $false
$inTable = $false
$tblWidths = @()
$tblHeader = @()
$tblRows = New-Object System.Collections.Generic.List[object]

foreach ($rawLine in ($content -split "`n")) {
  $line = $rawLine.TrimEnd("`r")
  if ($line.Trim() -eq '') { continue }

  if ($inTable) {
    if ($line -like 'TBLEND*') {
      $parts.Add((TableXml $tblWidths $tblHeader $tblRows))
      $inTable = $false; $tblRows = New-Object System.Collections.Generic.List[object]
      continue
    } elseif ($line -like 'R:*') {
      $cells = ($line.Substring(2)) -split '~~'
      if ($tblHeader.Count -eq 0) { $tblHeader = $cells } else { $tblRows.Add($cells) }
      continue
    } else { continue }
  }

  $isNum = $line.StartsWith('#:')
  if (-not $isNum) { $prevWasNum = $false }

  if     ($line.StartsWith('T:'))   { $parts.Add((TitlePara $line.Substring(2))) }
  elseif ($line.StartsWith('SUB:')) { $parts.Add((SubTitle $line.Substring(4))) }
  elseif ($line.StartsWith('H1:'))  { $parts.Add((Heading $line.Substring(3) 1)) }
  elseif ($line.StartsWith('H2:'))  { $parts.Add((Heading $line.Substring(3) 2)) }
  elseif ($line.StartsWith('H3:'))  { $parts.Add((Heading $line.Substring(3) 3)) }
  elseif ($line.StartsWith('TBL:')) {
    $inTable = $true; $tblHeader = @()
    $tblWidths = ($line.Substring(4) -split ',') | ForEach-Object { [int]$_ }
  }
  elseif ($line.StartsWith('P:'))   { $parts.Add((Para $line.Substring(2))) }
  elseif ($line.StartsWith('B:'))   { $parts.Add((Para $line.Substring(2) $true)) }
  elseif ($line.StartsWith('*:'))   { $parts.Add((Bullet $line.Substring(2))) }
  elseif ($line.StartsWith('#:')) {
    if (-not $prevWasNum) { $curNum = $nextNum; if ($nextNum -lt 13) { $nextNum++ }; $prevWasNum = $true }
    $parts.Add((NumItem $line.Substring(2) $curNum))
  }
  else { $parts.Add((Para $line)) }
}

$body = ($parts -join "`r`n")
$sectPr = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'

$documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  $body + $sectPr + '</w:body></w:document>'

# ---------- static parts ----------
$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>
'@

$relsRoot = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@

$relsDoc = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>
'@

$styles = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:color w:val="2E2A6B"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="5B5670"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="2E2A6B"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="3B3680"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>
'@

$numbering = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="3"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="4"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="5"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="6"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="7"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="8"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="9"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="10"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="11"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="12"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
<w:num w:numId="13"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
</w:numbering>
'@

# ---------- validate well-formedness ----------
$partsToCheck = @{ 'document.xml'=$documentXml; 'styles.xml'=$styles; 'numbering.xml'=$numbering; '[Content_Types].xml'=$contentTypes; '.rels'=$relsRoot; 'document.xml.rels'=$relsDoc }
foreach ($k in $partsToCheck.Keys) {
  try { [xml]$null = $partsToCheck[$k] } catch { Write-Error ("XML not well-formed: $k -> " + $_.Exception.Message); exit 1 }
}
Write-Host "All XML parts well-formed."

# ---------- zip into .docx ----------
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
if (Test-Path $outPath) { Remove-Item $outPath -Force }
$fs = [System.IO.File]::Open($outPath, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
$enc = New-Object System.Text.UTF8Encoding($false)
function Add-Part($zip,$enc,$name,$text) {
  $entry = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
  $s = $entry.Open()
  $bytes = $enc.GetBytes($text)
  $s.Write($bytes, 0, $bytes.Length)
  $s.Dispose()
}
Add-Part $zip $enc '[Content_Types].xml' $contentTypes
Add-Part $zip $enc '_rels/.rels' $relsRoot
Add-Part $zip $enc 'word/document.xml' $documentXml
Add-Part $zip $enc 'word/styles.xml' $styles
Add-Part $zip $enc 'word/numbering.xml' $numbering
Add-Part $zip $enc 'word/_rels/document.xml.rels' $relsDoc
$zip.Dispose()
$fs.Dispose()

$size = (Get-Item $outPath).Length
Write-Host ("Created: " + $outPath + " (" + $size + " bytes)")
