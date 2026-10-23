# Lens: the core jobs, end to end

Part of the [UI/UX review](README.md). 15 findings: 0 critical, 2 high, 7 medium, 6 low.

## How it should work

Journeys become short loops that actually finish. Each one starts where the work starts, asks for every fact once, shows what's at stake before the commit, and ends on a screen that says what happens next. The five verbs stay the frame: find, create, check, change, review.

**Start from named queues.** Home follows Mercury's Move money screen: a few action pills above queues with counts (https://mobbin.com/flows/fd8c08f3-1587-47b6-931c-2b1eb563592a). It also borrows Bill Pay's Total outstanding, Overdue and Due in 7 days tiles (https://mobbin.com/screens/74fb1222-9a02-416c-b7fd-bb736482ac39). HG's queues are Unassigned, Review, Approved not paid, Overdue and Key dates. Find stays one Cmd-K bar, and its results carry the fact you came for.

**Create in context.** One + opens Task, Deal, Document or Note, the way Jobber's create menu does (https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7). The property and unit come pre-filled from the page you're on, as Jobber's New job opens on Service for (https://mobbin.com/flows/59cc7ab8-69a0-4295-93e5-27735c624281).

**Residents feed the same queues.** A maintenance request asks what's wrong, takes photos and asks when we can come in, like Jobber's request (https://mobbin.com/screens/6dc1095d-d55e-4a6b-a271-a53130088fa2). The move-in report arrives through a personal link sent from the New tenant playbook. It goes room by room with Save & exit, like Airbnb's listing setup (https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394), and is filed to the unit as a document.

**Lifecycle steps are the primary button.** A closed deal shows Convert to property, the way Jobber shows Convert to Job (https://mobbin.com/screens/ec252fff-64da-4154-bfed-ccfc579fb2b7). A deal's next action is a task with a date. Anything typed once flows forward, per Gusto's principles.

**Commit, then a payoff.** Mercury's sent screen names what happened, says when it lands and shows the new record with its status (https://mobbin.com/flows/9c80fd70-83ab-4dfa-8d3a-51359a904365). Gusto's submitted screen pairs line art with a summary and Create another (https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c). Reversible changes skip the confirm dialog and offer Undo in a toast (https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3).

**Every loop keeps its history.**
- Records show a Wise-style Updates timeline (https://mobbin.com/flows/b51c3670-4335-4d6e-9d06-0576684d443d).
- A contractor job reads Marked done, Approved, Paid, like a Mercury reimbursement (https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13).
- The contractor page shows what HG has paid, from QuickBooks, grouped the way Mercury groups by payee (https://mobbin.com/screens/ee50b360-f122-40cf-8e96-61567d032bc0).
- A playbook run shows its progress as Gusto's setup timeline (https://mobbin.com/flows/9af21f74-3a74-4d67-b032-a9016f36cf81).

The time budget is Ramp's 15-second expense: logging an issue with a photo from a phone should take about that long. None of this adds chrome. One +, one toast region, one timeline and a few payoff screens replace today's dead ends.

<details><summary>What the reviewer covered</summary>

Server at http://localhost:3200 was up. All screenshots are in journeys/. I walked all ten journeys end to end and counted the clicks and page loads.

Routes exercised:
- Home (/)
- Deals: /deals (Active tab), /deals/new (empty submit, invalid URL, blocked submit that fell into the error boundary), /deals/[id] for 29 Livingston, and /deals/[id]?dup=1
- Tasks: /tasks with 193 open rows read from the aria tree, /tasks/new?propertyId= (filled and submitted, payload inspected), /tasks/[id]
- Properties: /properties, and /properties/[id] for 767 Prospect at desktop, tablet and mobile plus WebKit tablet. Rentals edit mode was opened and saved; the save was blocked and fell into the error boundary. I read the loan and insurance cards on 8 properties: 118 Congress, 647 Prospect, 58 Mariner, 15 Oxford, 428 Normal, 767 Prospect, 765 Prospect and 23 Sherwood.
- Financials: /financials and /financials/settings
- Contractors: /contractors and /contractors/[id] for David
- Public site: /rentals
- Global search states: results for "prospect", "plumb", "zack" and "767", plus no results, Esc, ArrowDown+Enter and Meta+K

Viewports and themes:
- Viewports: desktop 1280, tablet 768 (Chromium and WebKit), mobile 375 and narrow 320.
- Dark mode: Home and search on desktop and mobile.

Code read:
- App shell, nav and global search, plus /api/search
- Deal, task and property actions and services, back-link and attachments
- Listing editor, loan and insurance cards, Home, Financials pages
- Prisma schema
- The approved Asana migration spec, so findings build on D6 to D31 instead of repeating them

Not reached:
- Real write outcomes: redirects after create, revalidated lists and the duplicate-deal redirect in practice. These are inferred from code: deals/actions.ts:33, Next's redirect docs (push in Server Actions) and back-link.tsx.
- /settings, /financials/rent-roll beyond code, /residents, /welcome and /login
- The contractor portal, which isn't built yet

Mobbin: 17 searches (web and iOS). Ramp is not on Mobbin; Airwallex, Revolut Business and Midday stood in for the receipt flows.

---

**Your Mobbin AI usage is high this month**

Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect. [View usage and plan options](https://mobbin.com/settings/billing-and-usage)

</details>

## Findings

### JOURNEYS-006

**Empty loan maturity and insurance renewal dates are hidden, so the gap is invisible on every property**

High · Fix · effort S · `Property page > Loan and Insurance cards` · One record layout for every record

- **Today:** The Maturity and Renewal lines render only when a date exists. I checked 8 properties (118 Congress, 647 Prospect, 58 Mariner, 15 Oxford, 428 Normal, 767 Prospect, 765 Prospect, 23 Sherwood). None shows a maturity or renewal date, and every insurance carrier is a dash. Meanwhile 767 has a free-text task "loan is due" (Nov 1) standing in for the missing field. The auto-reminder tasks only exist when a date is set.
- **Why:** The schema calls maturity "load-bearing" and an insurance lapse a technical default. When the date is blank, the check-a-maturity journey ends in silence and no reminder is ever created. Stripe surfaces missing required details as "Action required".
- **Change:** Always render the Maturity and Renewal lines. When empty, show "Not set" in amber with an inline Add (tap to edit the date). Add a one-line notice at the top of the property hub when any key date is missing: "2 key dates missing: loan maturity, insurance renewal. Add". Feed the same check into the portfolio Key dates list (see JOURNEYS-007).
- **Desktop, tablet, phone:** Desktop and tablet: the line sits at the top of each card as today. Phone: the notice sits under the property title, so it is visible without scrolling to the Loan card (currently 3.6 screens down).
- **Reuse:** The edit-loan.tsx and edit-insurance.tsx header rows already exist; remove the conditional. Badge tone amber is reserved for warning. Use SectionCard tap-to-edit.
- **References:** 
  - [Attio](https://mobbin.com/flows/ed18fe27-a14a-4331-9d02-c5dceb2c60b9): Record details panel shows empty attributes as "Set Description..." prompts instead of hiding them
- **Code:** `src/app/(app)/properties/[id]/edit-loan.tsx:44`, `src/app/(app)/properties/[id]/edit-insurance.tsx:45`, `src/lib/properties/service.ts:130-158 (reminders only when a date exists)`
- **Verification:** confirmed. I swept all 11 properties, not 8. None renders Maturity or Renewal, and every Carrier is a dash. The conditionals are at edit-loan.tsx:44 and edit-insurance.tsx:45. I opened Attio flow ed18fe27 on Mobbin: its record panel shows empty attributes as "Set Description..." prompts, which supports this.

### JOURNEYS-007

**No portfolio-wide list of loan maturities, insurance renewals, tax dates and registrations**

High · New capability · effort M · `Portfolio / Home` · Home and Today become one work queue

- **Today:** Checking a maturity or renewal takes: Portfolio (load 1), pick a property (load 2), scroll to Loan (2,391px down on phone) or Insurance (2,843px). Then repeat for each of the 11 properties. The Portfolio table has Entity, Status, Open tasks, Units, Purchase and Value, and no dates. Key dates exist only as fields on each property and as auto-tasks mixed into 193 open tasks.
- **Why:** "What's coming due across the portfolio?" is a once-a-week owner question. Programa and Stripe show deadlines in one dated list grouped Overdue, This week and Later. Eleven page visits to answer it is the opposite of simple.
- **Change:** Add a Key dates list grouped Overdue, Next 30 days, Next 90 days and Missing. Rows show the date, the type (Loan maturity, Insurance renewal, Property tax, Rental registration), the property and days left. Each row opens the property hub at that card. Put it on Home as a card (top 5, "All key dates" link) and as a Portfolio view reached by a segmented Properties | Key dates control.
- **Desktop, tablet, phone:** Desktop: a 4-column table (Date, Type, Property, In). Tablet: same, with Type as a chip under the property. Phone: two-line rows (Type and property on line 1, date and "in 12 days" on line 2); the Missing group collapses behind a count.
- **Reuse:** Use lib/properties/service.ts REMINDERS (field, lead days, titles) as the source list. lib/dates.ts daysUntil and fmtDay. The segmented control comes from deals/filters.tsx (to be extracted). Table, Th, Td and Badge come from ui.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/74fb1222-9a02-416c-b7fd-bb736482ac39): Bill Pay opens with three count tiles that carry money (Total outstanding, Overdue, Due in next 7 days) above a list of due dates with a status chip such as Due next 7.
  - [Programa](https://mobbin.com/screens/079d676e-8012-4f1d-b29a-a20bfb05a015): Cross-project dated list grouped Overdue / This Week with a Type column (Install Date, Deposit Due)
  - [Mercury](https://mobbin.com/flows/1d51be38-aff7-4a34-835d-8c50f89f4fd5): Home Bill Pay card with Outstanding / Overdue / Due soon counts that link to the list
  - [Copilot Money](https://mobbin.com/screens/8edbc5d1-5e4d-4b8a-b916-c19f9558b6d4): 'Next two weeks' list of dated obligations with amounts.
- **Code:** `src/app/(app)/properties/page.tsx:50-60`, `src/lib/properties/service.ts:130-135`, `src/lib/properties/service.ts:121-150`
- **Also found as:** IA-032 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. Verified: the Portfolio table has no date columns. Every key date is blank on all 11 properties today, so the list would show only the Missing group until JOURNEYS-006 data goes in; ship 006 first. Spec week 2 already lists "the rest of the key-date reminder fix", so coordinate with it. This fits D10's Home as "what needs me". The Programa and Mercury references are plausible.

### JOURNEYS-015

**"What changed this week" has nowhere to look**

Medium · New capability · effort L · `New: Activity page (workspace)` · Home and Today become one work queue

- **Today:** True that nothing records changes outside deals (DealNote only; property and attachment writes log nothing). But D10 already puts an Activity tab on the property hub, and spec week 2 adds the "new from contractors" list, unread badges and the 7am summary, which cover most of "what changed". Build the event table (JOURNEYS-026) and the property tab first, then decide whether a workspace-wide page is needed.
- **Why:** Two partners and soon 29 contractors change things. Basecamp's Latest Activity and Attio's record activity answer "what happened while I was out" in one scroll, with who and when on every line.
- **Change:** Add an Activity page grouped by day ("Today", "Yesterday", "Mon Oct 19").
- Filters: This week | Last week and a person picker (Connor, Pieter, contractors).
- Each line reads "Pieter moved 29 Livingston St to 1 · High", "Zack marked Fix porch light done · 3 photos" or "Connor uploaded lease-unit2.pdf to 767 Prospect", with a link.
- Repeated date moves collapse into "Due moved 3 times".
- The property hub's Activity tab (D10) is the same feed filtered to one property.
- The Monday edition of the planned 7am summary email lists last week's counts and links here.
- **Desktop, tablet, phone:** Desktop: 720px column with day headings and a right-aligned time. Tablet: same, full width. Phone: day headings stay sticky; the time moves under the line; the filter row becomes one Filters button.
- **Reuse:** Generalize the spec's TaskEvent into an ActivityEvent table (see JOURNEYS-026). The deal timeline component moves to components/activity-timeline.tsx per the spec's reuse table. The 7am summary is already planned after cutover.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/b71d21b5-1078-44a4-adb3-9583531a6059): Latest Activity grouped by day, filter by project and person, "Emailing a daily summary"
  - [ClickUp](https://mobbin.com/screens/3a6160ae-bbc4-4ade-8914-228e7e89f839): Activity grouped Today / Yesterday per item, with "6 more updates" collapse
  - [Toggl Track](https://mobbin.com/screens/2deef352-1f6b-4757-a4c9-dcce106b0e6a): Week stepper and From to To chips for each change
- **Code:** `prisma/schema.prisma:83-92 (DealNote is the only history model)`, `src/lib/properties/service.ts (no change logging on patchProperty or attachments)`
- **Verification:** partly. Lowered to medium. Most of the job is already planned, and a new top-level page adds navigation weight. JOURNEYS-026 is the prerequisite.

### JOURNEYS-018

**Deals arrive by email, but there is no way to send an email into the app**

Medium · New capability · effort L · `Deals intake (new)` · Create where you are

- **Today:** Confirmed that New deal has no note or source field. Nothing in the app or spec shows that deals mostly arrive by email; the 675 deals came from a spreadsheet import. Inbound email is also new infrastructure beyond D30's outbound Resend plan. Confirm how deals actually arrive before scoping this.
- **Why:** Linear Asks and Midday give each workspace an intake address: forward the email and the record exists with the email attached. That turns the most frequent intake job into one forward from Mail on any device, and works on iPhone without a native app.
- **Change:** Give HG one intake address (for example deals@ on the app's mail subdomain).
- A forwarded email creates a Deal in a new "New from email" state: the address is parsed from the subject or body, the asking price parsed when present, the full email saved as the first timeline note with the sender as source, and attachments saved to the deal.
- The Deals page shows "3 new from email" at the top; Review opens each with Keep or Discard and duplicate detection (JOURNEYS-003).
- Settings shows the address with a Copy button.
- **Desktop, tablet, phone:** Desktop: the review banner sits above the table, and each item opens in the deal composer. Tablet: same. Phone: the banner becomes a row at the top of the list, and review is one card at a time with Keep and Discard at the bottom.
- **Reuse:** Resend inbound (the spec already sets up Resend on the app's mail subdomain, D30). Deal service createDeal and addDealNote, and normalizeAddress for duplicates. TaskAttachment-style storage for email attachments.
- **References:** 
  - [Mercury](https://mobbin.com/screens/bd9f86e7-9ef2-4745-91b8-10d3fdad2ced): Bill Pay shows its forwarding address as a chip beside the Inbox / Needs Approval / Scheduled / Paid tabs; forwarded bills land in Inbox for Review.
  - [Mercury](https://mobbin.com/screens/74fb1222-9a02-416c-b7fd-bb736482ac39): The same address chip sits on the Scheduled tab, so the intake address is always visible where the items arrive.
  - [Midday](https://mobbin.com/screens/346e4289-71df-4340-9359-794af38caef7): A unique inbox address with Copy; forwarded emails appear in the inbox to match
  - [Linear](https://mobbin.com/screens/39d051e4-a17d-467a-8175-ada50840a5da): Asks intake address that turns emails into issues, with a template applied
  - [Revolut Business](https://mobbin.com/flows/f110bf47-6f6a-4021-a015-87eb06b73dc3): Receipts emailed in show up with date and "Match found" status for review
- **Code:** `src/app/(app)/deals/new/page.tsx:13-48 (no note or source field)`
- **Verification:** partly. Lowered to medium until the intake channel is confirmed. The references (Midday, Linear Asks, Revolut) are plausible for the pattern.

### JOURNEYS-020

**"Back" after creating something returns to the blank create form**

Medium · Fix · effort S · `Task and deal pages after create` · Create where you are

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Referrer fix: back-link.tsx:15-20.
- **Today:** BackLink's in-app check is fixed: it now compares the navigation-timing URL with location.href, so client-side navigation counts as in-app even with an empty referrer. But createTask and createDeal still call redirect() with no replace, so Back after Create still returns to /tasks/new or /deals/new. The task page's BackLink falls back to /tasks, not to the task's property.
- **Why:** Back should mean "where I was". Landing on an empty form invites a duplicate entry.
- **Change:** Only the redirect half remains: redirect(url, RedirectType.replace) in tasks/actions.ts:73 and deals/actions.ts:33-34, and for a property task pass fallback=/properties/<id> to BackLink in tasks/[id]/view.tsx:75.
- **Desktop, tablet, phone:** No visual change.
- **Reuse:** components/back-link.tsx. next/navigation RedirectType.
- **References:** 
  - [Mercury](https://mobbin.com/flows/fa8230a8-23ff-4c52-b91f-568eae7b7bc1): The transfer runs in a sheet and ends on "You've transferred $10.00 to Savings" with Done (closes back to where you started) and Make Another Transfer.
- **Code:** `src/app/(app)/tasks/actions.ts:37`, `src/app/(app)/deals/actions.ts:34`, `src/components/back-link.tsx:11-16`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:29-31`, `branch src/components/back-link.tsx:15-20`, `branch src/app/(app)/tasks/actions.ts:73`, `branch src/app/(app)/deals/actions.ts:33-34`, `branch src/app/(app)/tasks/[id]/view.tsx:75`
- **Verification:** confirmed. Next's own docs confirm that redirect() pushes in Server Actions (redirect.md:29-31). BackLink decides from document.referrer (back-link.tsx:11-16), which client-side navigation never updates. JOURNEYS-V08 covers BackLink rendering as a button.

### JOURNEYS-025

**Documents are bare filenames: no type, date, uploader or rename**

Medium · New capability · effort M · `Property Documents` · Contractor jobs and media close the loop

- **Today:** Each row is a file icon, the filename (whatever the phone or scanner called it, such as IMG_4412.jpg), the size and Remove. There is no document type (Lease, Insurance, Closing, Loan, Permit), no uploaded date or uploader, and no rename.
- **Why:** Finding "the 428 lease" a year from now depends on the filename. Xero's Files and HubSpot's Documents show Associated with, Folder, Uploaded and Uploaded by, and allow rename.
- **Change:** Add a Type select (Lease, Insurance, Loan, Closing, Permit, Photo, Other) chosen after upload, with the most common type preselected from the filename. Show columns Name | Type | Uploaded (date and initials). Tap the name to rename. In the D10 Documents tab, add type filter chips.
- **Desktop, tablet, phone:** Desktop: 4-column table. Tablet: same, with Type as a chip. Phone: two-line rows (name; type chip, date and initials), with rename and remove in a row menu.
- **Reuse:** Extend the PropertyAttachment schema (kind, uploadedByUserId) to match the spec's TaskAttachment fields (5.2). Table, Th, Td, Badge and the InlineAddressField pattern for rename.
- **References:** 
  - [Gusto](https://mobbin.com/screens/71ee3cb0-d955-48ac-be98-0f6ae74c5ae0): The Add document dialog asks for a short name ("a short, 2-3 word description") above the upload, so files never arrive as bare filenames.
  - [Gusto](https://mobbin.com/screens/f97bf816-0c98-4b01-9ce3-fb1455e2c1b4): Documents list: the name over a source sublabel, and a status with its date (Signed, Nov 10, 2025).
  - [Gusto](https://mobbin.com/screens/e7219db1-ab49-403d-8b54-91a6b1c49499): Shared documents table with a one-line description under each name and an Uploaded by column.
  - [Xero](https://mobbin.com/screens/1d66ddcc-24c7-48d0-bbfd-690da3446b20): Files with Associated with, Folder, Size, Uploaded, Uploaded by, plus "Email to Files Inbox"
  - [Grok](https://mobbin.com/screens/b5736569-ff1d-46ed-8f68-8f93c7f91ca5): Clean file table with File type and Uploaded at columns
  - [Gusto](https://mobbin.com/screens/2a4319d4-c9f9-40df-84ee-3a9023c180bd): Name over a sublabel, with a status dot and date ('Signed Nov 10, 2025') in a fixed column.
  - [Mercury](https://mobbin.com/screens/ede3cc07-012f-4e55-a5c7-7cbe8b7f5907): Attachment row with its type ('Receipt') as the sublabel.
  - [Mercury](https://mobbin.com/screens/57ae12ab-0e8b-4cc1-b97e-2542adeeb8c5): 'Document type' select right above the upload.
- **Code:** `src/components/attachments.tsx:83-105`, `prisma/schema.prisma:267-279`, `src/components/attachments.tsx:84-104`, `prisma/schema.prisma:267 (PropertyAttachment: no type or date)`
- **Also found as:** G1D-I14 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** confirmed. PropertyAttachment already stores createdAt (schema.prisma:267-279), so the upload date is only a display gap; the uploader isn't stored at all. No property has documents yet, so this is groundwork for the D10 Documents tab. The Xero reference is plausible.

### JOURNEYS-I13

**New deal address is free text; suggest real addresses as you type, with a manual fallback**

Medium · New capability · effort M · `/deals/new (and every address entry)` · Create where you are

- **Today:** Address is a plain input with the placeholder "123 Main St, Buffalo, NY 14201". The same address ends up stored in several shapes. The 29 Livingston St timeline logs a reformat from "29 Livingston Street   Buffalo, NY 14213" to "29 Livingston Street, Buffalo, NY 14213". The move-in dropdown mixes "Ave." with "Avenue" and drops commas.
- **Why:** The address is the identity of a deal and of a property. Duplicate detection (JOURNEYS-003), search and the deal-to-property link all depend on it being consistent. Mercury's address entry suggests matching addresses as you type and keeps the typed text as the first row, "Enter address manually".
- **Change:** After 3 characters, the field suggests standardized US addresses from a geocoding provider limited to Erie County. Existing deals and properties come first: "Already a deal: 29 Livingston St · 1 - High" links straight to it. The first row is always "Use '[typed text]'".

Picking a suggestion stores the standardized form, so duplicates are caught before Create.

Pasting a Zillow or Redfin link into the field fills the address from the link's URL.
- **Desktop, tablet, phone:** Desktop (1280) and tablet (768): a popover under the field with up to 6 rows. Phone (375): suggestions open in a full-height sheet, with the list above the keyboard and Save pinned (Mercury). Nothing drops.
- **Reuse:** InlineAddressField, normalizeAddress in src/lib/normalize, and the branch's React Aria popover.tsx and sheet.tsx. The geocoding provider is new.
- **References:** 
  - [Mercury](https://mobbin.com/flows/9c80fd70-83ab-4dfa-8d3a-51359a904365): The Recipient address sheet shows the typed text first with "Enter address manually", then matching addresses with the typed characters underlined, and a pinned Save.
  - [Zillow](https://mobbin.com/flows/45f9651a-dd33-4d39-9e78-88f40c08373b): Add property modal: one street address field with a clear button and the helper 'Enter the USPS-validated address', then landing on the properties list with the new row.
  - [Quicken](https://mobbin.com/screens/6112b488-c8dc-4668-937e-c58bd6e3f9d5): Real-estate add flow: address field with an Add as typed manually option.
  - [PayPal](https://mobbin.com/screens/f91d5478-7799-4f8e-b4ac-3be2b3b802f0): Two-line suggestions (street, then city and state) plus Add address manually.
  - [Nextdoor](https://mobbin.com/screens/44d4a5de-104f-417c-af3e-1f92890226fa): Compact suggestion list with a pin icon and a manual-entry row.
- **Code:** `src/app/(app)/deals/new/page.tsx:16`, `src/app/(app)/properties/new/page.tsx:16`, `src/lib/properties/service.ts:67-69`
- **Also found as:** PORTFOLIO-024 (Portfolio list and new property)
- **Verification:** confirmed. Verified: the 29 Livingston timeline shows Connor fixing the address by hand twice (inspire deal aria lines 76-79). Mercury 9c80fd70 checked: the Recipient address sheet shows the typed text first with 'Enter address manually', then matches. Two cautions. A geocoding API adds a paid dependency and a key. The existing rows need a one-time cleanup either way (JOURNEYS-V04). Drop the Zillow and Redfin link parsing; it's scope creep.

### JOURNEYS-I15

**Assigning a job never warns that a contractor's insurance certificate is missing or out of date**

Medium · New capability · effort M · `Assignee picker (task create and task page) and /contractors/[id]` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The AssigneePicker's Contractors rows show the name, the trade and a 'Has login' tag, with no insurance state. The contractor page still shows 'Insurance (COI): View' with no expiry date.
- **Today:** The contractor page shows "Insurance (COI): View" as a Google Drive link with no expiry date. The data model holds only coiUrl, with no date. Neither the current assignee field nor the branch's AssigneePicker shows any insurance state, so a job can go to a contractor whose COI lapsed months ago.
- **Why:** Sending an uninsured contractor into an occupied unit is a real liability, and checking is exactly the step people forget. Ramp's approval inbox puts policy problems first. Brex flags a required item as Missing in red with one line of reason, right where the action happens.
- **Change:** Store a COI expiry date next to the file; the planned W-9 and COI tracking can set it when the contractor uploads.

On the contractor page, show "Insurance · expires Mar 3, 2027", turning red within 30 days and after expiry.

In the assignee picker, a contractor with a missing or expired COI shows a small red "COI expired" or "No COI" note under their name. They can still be picked, and the task's timeline records it.

Expiry dates also feed the Key dates list from JOURNEYS-007.
- **Desktop, tablet, phone:** Desktop (1280) and tablet (768): the note is one line under the name in the picker popover. Phone (375): the same line in the picker sheet. On the contractor page the expiry sits beside the COI link at every size. Nothing drops.
- **Reuse:** The branch's assignee-picker.tsx, the Contact model (coiUrl) and the Badge tones in ui.tsx.
- **References:** 
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): The required item shows a red Missing flag and "Your policy requires a receipt." right at the field.
  - [Gusto](https://mobbin.com/screens/f97bf816-0c98-4b01-9ce3-fb1455e2c1b4): Each document carries its status and date (Signed, Nov 10, 2025) in a fixed column.
- **Code:** `prisma/schema.prisma:186-187`, `task-management-migration-4c9ddf: src/components/assignee-picker.tsx`, `branch-src/src/components/assignee-picker.tsx:189-216`, `branch-src/prisma/schema.prisma:198-199`
- **Verification:** confirmed. Verified: Contact has coiUrl only, with no date (schema.prisma:186-187), and the branch's assignee-picker.tsx has no insurance state. 'W-9 and COI tracking through the portal' is already on the approved weeks 3 to 5 list, so the expiry date is planned; the new part is the warning in the picker. Brex e955e51e couldn't be confirmed: a Brex web search returned other apps.

### JOURNEYS-V03

**Tasks on Home and on the property page can't be checked off where they're listed**

Medium · Design change · effort S · `Home > My open tasks; Property > Tasks card` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Partly rebuilt: rescheduling in place now works on Home, but completing a task in place doesn't, on either list.
- **Today:** Home's My open tasks is now MyTasksList inside TaskListProvider. Each row has the title, the property, a status chip when the status isn't To do, and a Due chip with quick picks and an Undo toast, but still no checkbox. The property page Tasks card gained a status badge and an avatar (contractors outlined) and is sorted by Target, also with no checkbox. Closing a task from either list still means opening it.
- **Why:** These are the two places a partner checks "what's on me" and "what's open at 767", and neither can close the loop. Asana's Home My tasks widget puts a check circle on every row, next to an Overdue tab.
- **Change:** Home already sits in TaskListProvider (page.tsx:67-69), and the provider's check action already does optimistic tick plus toast. Add the existing TaskCheckbox at the start of each MyTasksList row. Wrap the property Tasks card in the same provider and reuse TaskRow there, so the D10 hub's Tasks tab inherits it. Keep a ticked row in place, faded, until the toast closes.
- **Desktop, tablet, phone:** Desktop: the 18px circle gets a 32px hit area. Tablet and phone: a 44px hit area, as the spec's Done checkbox extension already plans. The title truncates before the date drops.
- **Reuse:** tasks/task-checkbox.tsx TaskCheckbox (spec section 7 extends it with a 44px hit area).
- **References:** 
  - [Brex](https://mobbin.com/screens/3ee8d8b9-cf74-4fda-85ae-5e297aa158f5): Each task row ends in its own verb button (Finish), so work is done from the list without opening the record.
  - [Asana](https://mobbin.com/screens/eeef57df-99fe-478f-852f-8d52dd5e3360): Home My tasks widget with a check circle on every row and Upcoming / Overdue / Completed tabs
  - [Things 3](https://mobbin.com/screens/724087de-2e95-47ec-926c-efbdab249a23): Checked rows stay in place, dimmed, until you leave the list, which gives an undo window without a dialog.
  - [Linear](https://mobbin.com/screens/937fc32e-04c6-4c39-bcd6-17a42b4fe83c): Status circle at the start of each row, grouped by status with counts
  - [Todoist](https://mobbin.com/screens/52758ad6-7145-46d7-826b-2469b17f2ee0): Circle checkbox on every Today row
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): A checkbox leads every row, the project shows as a gray sublabel and the deadline flag sits at the right edge, so rows can be checked off in place.
  - [Things 3](https://mobbin.com/screens/5bc4a73d-af7d-4e63-aca2-27d13a2b1ed1): Select mode swaps in a compact bottom toolbar (When, Move, Delete) for clearing several stale tasks at once.
  - [Attio](https://mobbin.com/screens/5dab796d-b81b-4ac4-aa3a-f382b1682cb4): Tasks grouped This week, Upcoming and Completed, each row led by a circle checkbox, with 'Due tomorrow' in amber
  - [HoneyBook](https://mobbin.com/screens/2c4ab456-b21e-4917-a2f6-e0266d44f164): Task rows with a leading completion circle and a due date column
  - [Things 3](https://mobbin.com/screens/51b7617b-3a79-46c7-91e8-035532e61050): Every to-do row starts with a check box; project shows as a gray sublabel; red only for deadlines.
  - [Linear Mobile](https://mobbin.com/screens/30ebc468-06c8-46dd-9503-e197e89a1e5c): Status icon at the start of each row doubles as the quick state change.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): Dark toast above the tab bar names the change and offers Undo.
- **Code:** `src/app/(app)/page.tsx:72-92`, `src/app/(app)/properties/[id]/page.tsx:186-203`, `branch-src/src/app/(app)/tasks/my-tasks-list.tsx:12-31`, `branch-src/src/app/(app)/page.tsx:55-69`, `branch-src/src/app/(app)/properties/[id]/page.tsx:190-220`, `branch-src/src/app/(app)/tasks/task-checkbox.tsx`, `src/app/(app)/page.tsx:70-93`, `branch src/app/(app)/tasks/my-tasks-list.tsx:12-31`, `branch src/app/(app)/page.tsx:67-69`, `branch src/app/(app)/tasks/task-list-context.tsx:94-96`, `src/app/(app)/properties/[id]/page.tsx:179-200`, `src/app/(app)/tasks/task-checkbox.tsx:5`, `src/app/(app)/tasks/task-row.tsx:117`, `branch src/app/(app)/properties/[id]/page.tsx:196-219`, `branch src/app/(app)/tasks/task-row.tsx:84-91`, `src/app/(app)/properties/[id]/page.tsx:176-200`, `src/app/(app)/page.tsx:72-90`, `branch:src/app/(app)/properties/[id]/page.tsx:196-219`, `branch:src/app/(app)/tasks/my-tasks-list.tsx:15-30`
- **Also found as:** SHELL-022 (App shell, sidebar, top bar, global search and Home), PROPERTY-V02 (Property detail page (future property hub)), MOBILE-I01 (Lens: phone and tablet experience on every route)
- **Verification:** verifier-found

### JOURNEYS-019

**A newly created deal defaults to "5 - TBD", which the default Active tab hides**

Low · Fix · effort S · `New deal > Deals list` · Lists answer first and stay calm at 675 rows

- **Today:** The default status is "5 - TBD" and Deals opens on Active (statuses 1 to 4). But after Create you land on the new deal's own page, not the list. The TBD tab shows its count (17) in the same control, and TBD is the triage bucket in HG's pipeline. It's a mild surprise, and no work is lost.
- **Why:** "Where did it go?" right after creating something is the moment trust breaks. Linear and Attio always show what you just made in the view you return to.
- **Change:** After a create, return to the list with the new row visible and briefly highlighted: switch the tab to the new deal's status or show it pinned at the top for that visit. Or make the composer's default status the first Active one. Once stages split (JOURNEYS-016), default to "New" and include New in the default view.
- **Desktop, tablet, phone:** Same everywhere. On phone the highlighted row scrolls into view.
- **Reuse:** lib/config.ts DEFAULT_DEAL_STATUS and ACTIVE_DEAL_STATUSES. deals/page.tsx statusFilter. The existing row flash in DealRowEditable (green tint) can mark the new row.
- **Code:** `src/lib/config.ts:27,30`, `src/app/(app)/deals/page.tsx:50-59`
- **Verification:** partly. Code confirmed at config.ts:27,30 and deals/page.tsx:50-59.

### JOURNEYS-032

**The New deal form has no place for the note or who sent the deal**

Low · Design change · effort S · `New deal` · Create where you are

- **Today:** Confirmed: New deal has no notes or source field. The Notes field (saved as the first timeline entry) is the useful half. A new Source column with autocomplete adds a field and a migration for unproven value, and it overlaps JOURNEYS-014 and 018.
- **Why:** Linear's composer has a description under the title so context is captured in the same motion. Who sent the deal matters for following up and for knowing which sources produce closes.
- **Change:** Add two fields to the deal composer: "Notes" (multi-line, saved as the first timeline entry) and "Source" (free text with autocomplete from previous sources, for example "Mike at Hunt"). Drop "(target/max)" from the Our price label and show it as helper text on focus only.
- **Desktop, tablet, phone:** Desktop and tablet: Notes spans the full width under Address. Phone: Notes collapses to an "Add notes" row that expands.
- **Reuse:** Textarea from ui.tsx and addDealNote in the deal service. Adding a Deal.source column is a small migration.
- **References:** 
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): The New request form asks "How did you hear about us?" next to the description, so the source is captured with the record.
  - [Linear](https://mobbin.com/flows/b49200b2-cfac-4c16-aae9-55aecdb91d09): Title plus description captured in one composer before Create
- **Code:** `src/app/(app)/deals/new/page.tsx:14-47`
- **Verification:** partly. Lowered to low and folded toward JOURNEYS-014.

### JOURNEYS-039

**After updating a listing there's no link to see it live, and the public page has no per-listing anchor**

Low · Design change · effort S · `Property > Rentals and public /rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** Confirmed: public cards have no id or anchor, and the Rentals card links only to Zillow. This is an occasional check, and all three public listings are placeholders today, so low.
- **Why:** Airbnb's listing editor has a persistent "View" button that opens the guest-facing listing. Verifying what tenants see should be one tap.
- **Change:** Give each public card an id (for example /rentals#767-prospect-lower-front). In the app, each Available listing gets a "View on site" link next to Zillow, opening that anchor in a new tab. After saving the Rentals editor, the toast reads "Rentals saved. View on site".
- **Desktop, tablet, phone:** Desktop and tablet: text link in the listing row. Phone: the link moves under the unit name; tapping it opens the in-app browser at the anchor.
- **Reuse:** (marketing)/rentals/page.tsx ListingCard (add an id). edit-listings.tsx ReadListings row. Spec toast.
- **References:** 
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): The property overview pairs View your listing with Edit your listing, and shows how long the listing has been active.
  - [Airbnb](https://mobbin.com/screens/9c3ff546-9537-4494-afc5-dded8925fdab): Listing editor with a floating "View" button to see the guest-facing page
- **Code:** `src/app/(marketing)/rentals/page.tsx:65,81 (no id on cards)`
- **Also found as:** IA-047 (Lens: information architecture and global SaaS patterns)
- **Verification:** partly. The Airbnb reference fits.

### JOURNEYS-042

**"Map it in Financials → Settings" drops you at the top of a long settings page**

Low · Fix · effort S · `Property Financials card > mapping link` · The QuickBooks mirror is honest about what it covers

- **Today:** From 767's Financials card, the link opens /financials/settings at the top. Class → property mapping is the third card, with about 12 class selects, followed by about 25 account category selects. Nothing points at 767 or at the unmapped classes.
- **Why:** A fix-it link should land on the fix. Stripe's "Action required" links open the exact field.
- **Change:** Link to /financials/settings?map=<propertyId>#classes. Scroll to the mapping card and highlight unmapped classes, with this property preselected as the suggested target. Card copy: "Not linked to QuickBooks yet. Link a class".
- **Desktop, tablet, phone:** Same everywhere. On phone the highlighted row scrolls under the sticky header.
- **Reuse:** properties/[id]/financials.tsx:25-28 and financials/settings controls.
- **Code:** `src/app/(app)/properties/[id]/financials.tsx:24-29`
- **Verification:** confirmed. Verified: the class mapping card starts at 906px on a 1,863px page with 102 selects, and the link lands at the top.

### JOURNEYS-I11

**Once approved, a contractor job is simply Done; nothing tracks that it still needs paying**

Low · New capability · effort M · `Contractor job review (/tasks/[id] on the migration branch) and Home` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Task has no amount or paid fields, and Approve is still one tap. The banner calls setTaskStatus DONE; the Today row calls approveTask. An approved job simply becomes Done.
- **Today:** Tasks have no amount or paid fields today, and an approved job simply becomes Done, confirmed. But Approve is one tap: review-banner.tsx:40-42 calls setTaskStatus DONE directly. The sheet in that file belongs to Send back, so 'Approve opens the existing sheet' would add a step to every approval. The review queue lives in the Contractors column of Today ('Needs review'), not on Home.
- **Why:** After approval, the contractor's next question is when they'll be paid, and the partners' question is what's owed this week. Mercury shows a reimbursement as one vertical timeline (Submitted, Approved, Payment pending), each step with its date and who acted, so approval and payment read as one loop. HG's loop stops at approval.
- **Change:** Add an optional Amount and a Paid date to contractor jobs. They are side-rail fields, not a status, so D6's seven statuses stay as they are.

Approve opens the existing sheet with one optional field: "Amount to pay". The button reads "Approve", or "Approve · $1,250" once an amount is entered.

Home's Review queue gains a line: "Approved, not paid · 3 · $4,250".

Setting a Paid date, or matching a QuickBooks bill for that vendor and amount (JOURNEYS-I10), adds "Paid Oct 30 by check" to the job's timeline. The contractor sees that line on the job in the portal; it sends no new email.
- **Desktop, tablet, phone:** Desktop (1280): Amount and Paid date in the task's side rail, and the Home line inside the Review card. Tablet (768): the same in the stacked rail. Phone (375): the two fields appear in the job's facts list; the Home line shortens to "3 to pay · $4,250".
- **Reuse:** The branch's review-banner.tsx sheet, fields.tsx side rail, toast.tsx, and the activity timeline.
- **Challenges:** D6 (seven statuses): this adds Amount and Paid date fields, not a status. D19: the contractor sees the paid line in the portal and gets no extra email.
- **References:** 
  - [Mercury](https://mobbin.com/screens/fa5eb50e-1c4e-42d6-be52-5cf612bf3d13): The reimbursement shows Submitted, Approved and Payment Pending as one timeline with dates and who acted, plus a toast "Reimbursement payment approved".
  - [Mercury](https://mobbin.com/screens/74fb1222-9a02-416c-b7fd-bb736482ac39): Bill Pay keeps Total outstanding and Due in next 7 days as counts with sums above Inbox, Needs Approval, Scheduled and Paid tabs.
- **Code:** `task-management-migration-4c9ddf: src/app/(app)/tasks/[id]/review-banner.tsx:40-47`, `prisma/schema.prisma:204-207`, `branch-src/src/app/(app)/tasks/[id]/review-banner.tsx:42`, `branch-src/src/app/(app)/tasks/task-list-context.tsx:98`, `branch-src/prisma/schema.prisma model Task (no amount/paid fields)`
- **Verification:** partly. Tracking amounts and paid dates on tasks builds a second payables record beside QuickBooks, the system of record, and adds fields, a sheet and a Home line. That pulls against the simplicity bar. If Connor wants it, keep Approve one tap and put an optional Amount in the side rail. Mercury fa5eb50e and 74fb1222 not spot-checked.

### JOURNEYS-I14

**No "Create similar" on a task, so the same job for another unit or property is retyped**

Low · New capability · effort S · `Task page More actions (/tasks/[id])` · Create where you are

- **Migration branch:** Still applies on the migration branch. The task page '…' menu still offers Copy link, Cancel task and Delete, with no Create similar.
- **Today:** On the migration branch, a task's More actions menu offers Copy link, Cancel task and Delete. The current build has no menu at all. Repeating a one-off job at another unit or property (a punch item, smoke detector checks, gutter cleaning) means retyping the title, notes, checklist and contractor.
- **Why:** Jobber's quote menu puts Create Similar Quote next to Convert to Job, and Wise puts "Repeat this transfer" on a finished transfer. Auto-repeat (D27) covers schedules but not one-off copies to another place.
- **Change:** Add "Create similar" as the first item in More actions. It opens the composer pre-filled with the title, notes, checklist, assignee and property, with the Property chip focused so the next choice is the unit or property. After create, a toast reads "Task created · View · Undo".
- **Desktop, tablet, phone:** Desktop (1280) and tablet (768): a menu item in the header overflow. Phone (375): the same item in the overflow sheet, and the composer opens as a bottom sheet. Nothing drops.
- **Reuse:** The branch's menu.tsx, the task composer, createTask and toast.tsx.
- **References:** 
  - [Jobber](https://mobbin.com/screens/1e4846b8-cb8a-40eb-9491-54c8db93960f): More Actions lists Convert to Job, then Create Similar Quote, above the status and export actions.
  - [Wise](https://mobbin.com/flows/b51c3670-4335-4d6e-9d06-0576684d443d): "Repeat this transfer" is the primary button on a completed transfer.
- **Code:** `task-management-migration-4c9ddf: src/app/(app)/tasks/[id]/header.tsx:69-90`, `branch-src/src/app/(app)/tasks/[id]/header.tsx`, `task-management-migration-4c9ddf HEAD: src/app/(app)/tasks/[id]/header.tsx:34,82-102`
- **Verification:** confirmed. The branch's More actions menu has Copy link, Cancel task and Delete (header.tsx:69-90). The current build's task page has no overflow menu (verify-JOURNEYS/v-task--desktop-light.aria.txt). Small, useful and adds no chrome. Jobber 1e4846b8 and Wise b51c3670 not spot-checked.
