# Contractors directory, contractor detail and Settings

Part of the [UI/UX review](README.md). 48 findings: 0 critical, 6 high, 24 medium, 18 low.

## How it should work

Contractors and Settings become two quiet places that each answer one question: who does our work and what can they reach, and how is the system set up. Every element is a status, a number or an action.

Directory. The page is titled 'Contractors' with its count and one Add contractor button. Above the rows sit search and a short view switch (All, Needs email, Needs W-9), the way Mercury's Recipients list puts Has Tax Docs and Needs Tax Docs over its table (https://mobbin.com/screens/ee13c597-f333-4830-8faa-7265e283e2b1). Rows read as people: name over company, as in Clerk's members table (https://mobbin.com/screens/489a3e32-c494-4f43-bffb-7ddc46d4abd5), then trade, open jobs, the phone as a call link, and portal status in the fixed Last login spot that Linear and Jobber use (https://mobbin.com/screens/ae99a607-158a-4642-a69f-00c024381bd0, https://mobbin.com/screens/024081f3-c028-4a49-ac5e-cf4b6fbbaa20). Phones get Shopify's two-line rows (https://mobbin.com/screens/8d012513-7214-4c00-935d-aaa2307452f9).

Record. Jobber's client page is the domain twin (https://mobbin.com/screens/993bf957-ad78-49ae-9e3a-981cf0ae8081). The header has the name with one activity line, like Clerk's 'Last active today' (https://mobbin.com/screens/cc7b612d-5981-493b-aff8-dd023f0cfb7a), then Call, Text, Email and New job. Open jobs fill the main column. The rail holds details, documents, paid this year, internal notes labeled team-only (https://mobbin.com/screens/abeeeed7-cf13-4196-b7cb-6c97a3f5d90f) and the approved Portal access card. That card follows Basecamp's 'What can Jane Doe access?' (https://mobbin.com/screens/cf079850-f3c0-467d-98e3-8b7b4caf2d8a): what the contractor can see, a Preview as link, where updates go, and what happens next before a login exists. W-9 and COI show as a status with a date (Gusto, https://mobbin.com/screens/349671a4-82a6-4dfe-9019-67d4686a0b04) and can be requested through the portal (Mercury, https://mobbin.com/screens/0ae73718-a491-400d-96e3-0392f4dd9f37). Archive states its effect before you confirm, as Jobber's Deactivate does (https://mobbin.com/screens/7d406b93-e47a-4fb1-a7c2-bc59bc456bb5).

Settings. Settings becomes a short index with three groups plus Activity: Portfolio (CapEx rules, Move-in form), People (partners and contractor logins) and Connections (QuickBooks, Files, Email). Pages use Supabase's layout (https://mobbin.com/screens/9497f33f-63fc-4547-9171-bbb1092bf178): a heading with one plain line, rows that say what a setting does next to its control, and Save in the card footer. Connections state their status in sentences: company name, last sync, reconnect date and emails sent today. Destructive controls such as Disconnect QuickBooks and Reset to defaults sit in a red-banded section at the bottom, and the confirm names the consequence (Vercel, https://mobbin.com/screens/95b9c070-3863-4e9b-8de5-8fb336637b18). Activity lists who did what, as Vercel's does (https://mobbin.com/screens/a111dca7-48a2-4456-bba7-acec68ff70f0), including every lockbox code a contractor opened.

<details><summary>What the reviewer covered</summary>

Server on :3200 was up the whole time. All screenshots and aria dumps are under ADMIN/.

/contractors: shot at desktop 1280, wide 1920, tablet 768, mobile 375 and narrow 320 in light mode, plus desktop and mobile in dark mode and mobile in WebKit, including a scroll attempt. I also read aria text at every size, ran ?q=plumb, and pulled the link and tap-target sizes.

/contractors/[id]:
- Zack Reading: desktop, tablet and mobile with scrolled shots, plus dark desktop.
- Jose Alvarez: desktop and mobile.
- Steve Fuller, David, David Waryk, Steve Cristiano, Nick and Mark Kreuder: desktop.
- All 29 records: fetched to count matched jobs.
- A bad id: gives a 404.

/settings (CapEx rules): desktop, tablet, mobile, narrow and wide, plus dark desktop and mobile. Interactions tried:
- hovering and focusing a row, and Escape in a money cell
- a Replace age below Monitor, and an invalid type name
- committing a cost change (blocked, which brought up the error boundary)
- + Add appliance (blocked, same result)
- Reset to defaults dialog, then Esc
- tapping a row on mobile

/settings/move-in-form: desktop, tablet, mobile and narrow with scrolled shots, plus dark desktop. Tried: editing a label, + Add item and where focus lands, Cancel's Discard dialog then Esc, Save (blocked, error boundary), and switching tabs with unsaved changes.

/settings/storage: desktop, tablet, mobile and narrow, plus dark desktop. The migrate button is disabled locally because there's no Blob token, so I never saw its pending or report states.

For context only: /financials/settings (QuickBooks), and 767 Prospect Ave's Building CapEx section, to check how the CapEx rules carry through.

Could not reach:
- any successful save or toast state, because writes are blocked
- the server validation and conflict messages (read in the code instead)
- the inactive-contractor state (every Contact is active)
- the laptop 1440 viewport (not shot)
- the WebKit runs of the settings pages

Mobbin: 19 searches. Ramp isn't on Mobbin; the vendor-list queries returned Mercury, Airwallex, Square, Melio, QuickBooks and Xero, and I cite those.

</details>

## Findings

### ADMIN-002

**'+ Add system' saved a blank 'New system' rule that now shows on every property**

High · Fix · effort S · `/settings (CapEx rules), surfacing on every /properties/[id]` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. The branch's database copy has the stray rule too. Building systems on /settings holds 'New system | 0 yrs | 0 yrs | $0', and /properties/cmtg25y4p0006jphsv3frndk6 reads 'Building CapEx 3 / 11 systems dated ... New system — — — Unknown'. Clicking '+ Add system' still fires a POST the moment it is clicked. With the write blocked, that drops straight to the error card.
- **Today:** Building systems lists 'New system 0 yrs 0 yrs $0'. On 767 Prospect Ave the Building CapEx table's first row reads 'New system — — — Unknown' and the header counts it ('3 / 11 systems dated'). addBuildingSystem() persists the placeholder the moment the link is clicked; addAppliance() and addCoreSystem() persist 0 / 0 / $0 rows the same way, and the server accepts a Replace age of 0.
- **Why:** A click that was never finished became real data on all 11 property pages. Stripe and Linear create drafts that only save once they are complete.
- **Change:** Delete the stray rule now (one-off). Make Add create a local draft row with its name field focused; it saves only once it has a name and a Replace age above 0, and Esc or leaving it empty discards it. On the server, require replace ≥ 1 so a zero rule can't be stored again.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: draft row at the top of its section with the name focused. Phone 375: Add opens the rule sheet from ADMIN-013 instead of inserting a row.
- **Reuse:** Add helpers in capex-rules-editor.tsx; zod schema in src/app/(app)/settings/actions.ts.
- **References:** 
  - [Stripe](https://mobbin.com/screens/e8860e07-c107-43c1-b483-27724ff01d37): Create form requires a name before anything is saved
- **Code:** `Page text on /properties/cmtg25y4p0006jphsv3frndk6: 'Building CapEx 3 / 11 systems dated … New system — — — Unknown'`, `src/app/(app)/settings/capex-rules-editor.tsx:254-267`, `src/app/(app)/settings/capex-rules-editor.tsx:287-293`, `src/app/(app)/settings/actions.ts:15-16`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:254-267`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:287-293`, `branch:src/app/(app)/settings/actions.ts:15-16`, `src/app/(app)/settings/capex-rules-editor.tsx:288`, `Local DB: AppConfig building rules begin with key 'new-system'; DEFAULT_CAPEX_RULES has 10 systems`, `src/app/(app)/settings/capex-rules-editor.tsx:288-293`, `src/app/(app)/settings/capex-rules-editor.tsx:286-292`
- **Also found as:** PROPERTY-023 (Property detail page (future property hub)), PROPERTY-V06 (Property detail page (future property hub)), VISUAL-V04 (Lens: visual design system across every screen), COPY-015 (Lens: words on every screen)
- **Verification:** confirmed. Building systems lists 'New system 0 yrs 0 yrs $0' (verify-ADMIN/capex--scrolled--desktop-light.png). Both 767 Prospect and 118 Congress list 'New system — — — Unknown' first, and their Building CapEx headers count it ('3 / 11 systems dated'). The server's age schema allows 0 (actions.ts:15). The fix is right.

### ADMIN-003

**Contractors can't be added or edited anywhere in the app**

High · New capability · effort M · `/contractors, /contractors/[id]` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. /contractors and /contractors/[id] still have no Add or Edit control. On the branch, contractors/actions.ts writes only PortalAccount rows (create login, reset, sign out, remove, restore) and nothing writes Contact. The same seven contractors still have no phone: Alison Hurtado, Dust 2 Sparkles, Fox Pest, Jon Oconnel, Mark Kreuder, Melvin Miles and Nick. Names are still lowercase. The Portal access card prefills its Email field from Contact.email but never saves a typed email back to the contractor.
- **Today:** Neither page has an Add or Edit control, and no server action writes Contact; the only writer is the migration script. Seven contractors have no phone (Alison Hurtado, Dust 2 Sparkles, Fox Pest, Jon Oconnel, Mark Kreuder, Melvin Miles, Nick) and several names are lowercase ('John detzler', 'Jacob (Jake) hoak'). None of it can be fixed without running a script.
- **Why:** A directory nobody can edit goes stale on day one. Portal logins hang off each Contact's email (D4, D14) and invites go out Thu Oct 29, so a missing or wrong email blocks an invite.
- **Change:** Add an 'Add contractor' primary button in the page header that opens a short dialog (Name, Company, Trades, Phone, Email; Cancel and Add contractor). On the record, details are tap-to-edit in place, and the ... menu offers Archive instead of delete (Contact.active already exists). Writes go through a contacts service, per the README rules.
- **Desktop, tablet, phone:** Desktop and tablet: a centered dialog about 480px wide. Phone: a full-height sheet with Cancel and Add in its top bar; tap-to-edit on a field opens the same sheet for that one field.
- **Reuse:** Grow ConfirmDialog into the Dialog shell (Known gaps) on React Aria (D9); Input; InlineAddressField generalized to any text (Duplicates); Contact.active for Archive.
- **References:** 
  - [Stripe](https://mobbin.com/screens/d5400786-97c3-4029-a3e2-e21a9fa7735e): Create customer dialog: a few fields, Cancel and one primary action
  - [Mercury](https://mobbin.com/screens/0546a342-6b5a-47c3-8d95-4871d6eb59d5): Add a vendor as the single primary action on the vendor list
  - [Attio](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf): Empty attributes shown as 'Set …' placeholders you click to edit in place
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): The global + menu lists Client next to Job, Task and Request, so adding a person is a first-class create action, not a settings job.
  - [Attio](https://mobbin.com/flows/ed18fe27-a14a-4331-9d02-c5dceb2c60b9): Create a record then inline-edit attributes in the details panel
  - [TextNow](https://mobbin.com/screens/f7c507d4-3ee5-4161-995f-70036e75ae22): Contact page with a top-right Edit
- **Code:** `src/app/(app)/contractors/page.tsx:22-66`, `src/app/(app)/contractors/[id]/page.tsx:30-120`, `scripts/migrate/02-contractors.ts:199-202`, `branch:src/app/(app)/contractors/actions.ts:20-61`, `branch:src/app/(app)/contractors/page.tsx:22-66`, `branch:src/app/(app)/contractors/[id]/page.tsx:51-121`, `src/app/(app)/contractors (page.tsx and [id]/page.tsx only; no actions.ts)`, `branch src/app/(app)/contractors/actions.ts:20-60 (portal actions only)`, `branch src/components/assignee-picker.tsx:168`, `branch src/lib/tasks/assignee-options.ts (active filter)`
- **Also found as:** JOURNEYS-011 (Lens: the core jobs, end to end)
- **Verification:** confirmed. No server action writes Contact; the only writer is scripts/migrate/02-contractors.ts:199-202. The case is stronger than stated: 14 of 29 contractors have no email on their record, and D14 sign-in is by email. Those 14 include Jeremiah Anderson, whose Asana tasks are under '[email]', and Jon Oconnel, who has painting work. Unless the record can be edited, those invites can't go out Oct 29. I didn't see the cited Stripe dialog URL myself, but a Stripe customers list I pulled shows the same 'Add customer' primary button (https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c).

### ADMIN-004

**Phone numbers and emails aren't tappable**

High · Fix · effort S · `/contractors, /contractors/[id]` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. Partly fixed in 9f74ea1: the directory Phone column and the record's Phone are now tel: links, and Email is a mailto: link, in the same text style with underline on hover. Still open: there's no sms: Text link on touch, no maps link for the mailing address, no Copy button, and phone numbers inside notes are still plain text (Steve Fuller's after-hours line). Those extras are left to Connor. /contractors and every record checked (Zack Reading, Jose Alvarez, Steve Fuller and others) have zero tel:, sms: or mailto: links. Phone and email are plain text in the directory and in the Contact card. Steve Fuller's after-hours line in his note ('[phone] call that number for their after hours paging system') is still plain text. The only sms: link on the branch is 'Text login details', which appears after a login is created.
- **Today:** The directory's Phone column and the record's Phone and Email are plain text; the aria tree has no tel:, sms: or mailto: links. Steve Fuller's note holds an after-hours line ('[phone] call that number for their after hours paging system') as plain text as well.
- **Why:** The main job here is to call or text a contractor. Today that means long-press, copy and switch apps. Every contact pattern on Mobbin puts call and message one tap away.
- **Change:** Render phone numbers as tel: links (same text style, underline on hover) with an sms: 'Text' link beside them on touch, emails as mailto:, the mailing address as a maps link, and linkify phone numbers inside notes. On desktop, add a small Copy button on hover that confirms with 'Copied'.
- **Desktop, tablet, phone:** Desktop: link plus a hover Copy button. Tablet and phone: tap the number to call; 'Text' sits next to it on the record. In the phone directory the call button from ADMIN-005 covers it.
- **Reuse:** Field in src/components/ui.tsx; the formatPhone helper the importer uses; LinkButton for the header actions in ADMIN-011.
- **References:** 
  - [Jobber](https://mobbin.com/screens/993bf957-ad78-49ae-9e3a-981cf0ae8081): Contact info rail on a client record: phone and email are links in the accent color, so one tap calls or writes
  - [Jobber](https://mobbin.com/screens/7c66f8f1-8ea8-4582-98bf-a0f88dcccf56): iOS client record keeps a phone icon in the nav bar, so calling works from anywhere on the page
  - [Quo](https://mobbin.com/screens/5bbde933-f170-44fc-93c6-290406469f58): Call, message and email icon buttons above tappable contact fields
  - [Telegram](https://mobbin.com/screens/a063aa74-306b-4190-9a1c-5587022e9be3): Tapping the number shows a 'Phone copied to clipboard' toast
  - [Shopify](https://mobbin.com/screens/b1bce388-5468-4881-9e33-827b4581cb3b): Customer card on the order has two equal buttons, Email details and Phone details, plus tap-to-copy address with an Address copied toast.
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): A phone icon in the record's top bar calls the client, and a full-width Directions button sits under the address.
  - [TextNow](https://mobbin.com/screens/f7c507d4-3ee5-4161-995f-70036e75ae22): Message and call as two equal buttons under the name, number below as a tappable row
  - [Beside](https://mobbin.com/screens/f6ab0ee0-a578-4897-b604-3366ec4fb254): Round Call and Chat actions centered under the contact header
  - [Linear Mobile](https://mobbin.com/screens/065e774e-91b9-4a34-b0e5-0116a13e84f7): Copy confirms with a small toast, 'URL copied to clipboard'. HG's version: 'Phone number copied'.
  - [WhatsApp](https://mobbin.com/screens/56113f98-413d-4ea4-b3e8-1aedb33075bc): Phone field with a phone icon and a copy icon on the right.
  - [Aboard](https://mobbin.com/screens/0aa65981-a5ab-4f8a-b574-653f1f6c47ff): A one-word "Code copied" toast confirms the copy.
  - [Jobber](https://mobbin.com/flows/54dfb6e2-9112-4ca1-a3b6-c7a892cc09f7): The request record has a phone icon in the header and a full-width Directions button under the address, so calling and navigating are one tap on a phone.
  - [Jobber](https://mobbin.com/screens/c47c3aa9-2c64-434a-b1a1-9a7f326eb38c): On web, the contact block shows phone and email as links inside the record header.
  - [WhatsApp](https://mobbin.com/screens/a6b9faac-3e67-42f6-b2ec-aab2ba9cfc0e): Inline message / video / call icons on the phone-number row
- **Code:** `src/app/(app)/contractors/page.tsx:53`, `src/app/(app)/contractors/[id]/page.tsx:49-51`, `src/app/(app)/contractors/[id]/page.tsx:73-77`, `branch:src/app/(app)/contractors/page.tsx:53`, `branch:src/app/(app)/contractors/[id]/page.tsx:71-72`, `branch:src/app/(app)/contractors/[id]/page.tsx:95-99`, `branch:src/lib/portal/office.ts:8-11`, `branch:src/lib/portal/login-text.ts:36`, `grep 'tel:' src: no matches`, `src/app/(app)/contractors/[id]/page.tsx:49`, `src/app/(app)/contractors/page.tsx:34-38`, `branch src/app/(app)/contractors/[id]/page.tsx:71-72`, `branch src/app/(app)/contractors/page.tsx:53`, `src/app/(app)/contractors/[id]/page.tsx:71-72`, `eval: tel 0, mailto 0, sms 0 (desktop and mobile)`, `src/app/(app)/contractors/[id]/page.tsx:49-50`, `branch src/components/ui.tsx:94`
- **Also found as:** MOBILE-012 (Lens: phone and tablet experience on every route), FEEL-039 (Lens: interaction quality, feedback, states, speed and accessibility), JOURNEYS-010 (Lens: the core jobs, end to end)
- **Verification:** confirmed. Zero tel:, sms: or mailto: links at every size. Steve Fuller's after-hours line is plain text in the note. This changes no layout, so it counts as a fix. The desktop Copy button is optional chrome and can wait.

### ADMIN-005

**On phones the directory hides the phone number behind sideways scroll**

High · Design change · effort M · `/contractors` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. /contractors at 375 is the same table. Name, Company and part of Trades are visible. Phone and Docs sit behind the card's sideways scroll (inner scrollWidth 573 against clientWidth 341). Names wrap to two lines ('Alison / Hurtado'), and the 'tenant fixes' chip wraps under the name onto two lines of its own.
- **Today:** At 375 and 320 the table shows Name, Company and part of Trades. Names wrap to two lines, the 'tenant fixes' chip wraps under the name, and Phone and Docs can only be reached by scrolling the card sideways. WebKit behaves the same.
- **Why:** The phone is where you call a contractor from. Stripe and Ramp use tables on desktop, but their phone layouts are lists with the main action on the row.
- **Change:** Below 640px, show each contractor as a list row: initials avatar, name, a muted second line with the company or first trade, and a round Call button (tel:) at the end. Tapping the row opens the record. Company, Docs and the full trade list drop on phone.
- **Desktop, tablet, phone:** Desktop 1280: the table from ADMIN-027. Tablet 768: table with Name and company, Trades, Phone and Portal. Phone 375 and 320: list rows with a Call button and no sideways scroll.
- **Reuse:** Table, Th and Td for wider sizes; initials() in src/lib/utils.ts; a new list row based on Granola.
- **References:** 
  - [Shopify](https://mobbin.com/screens/8d012513-7214-4c00-935d-aaa2307452f9): iOS customers list: name on line one, location and figures on line two, status chip right-aligned, no sideways scroll
  - [Granola](https://mobbin.com/screens/b77f0087-25d0-4e08-b7f7-7661518faf0c): Contact rows with an initials avatar, the number, and a round call button at the end
  - [Quo](https://mobbin.com/screens/76e63179-80a3-4b1f-9e62-f38b2d1a7593): Contacts list: count beside the title, search, removable filter chips, compact rows
  - [Jobber](https://mobbin.com/screens/8a9ce411-4444-450e-96f7-b3fc5eef9654): Two-line phone rows (name; context) with status on the right
  - [Jobber](https://mobbin.com/screens/a6fb2d6f-b990-48c4-91c0-9a4dac929ea4): Desktop list showing phone and email inline in a Contact column
  - [Stripe Dashboard](https://mobbin.com/screens/dfac1ff2-e82e-41df-9324-295591ea9959): Customers as plain rows: name, then one muted line of context, with the add button in the title bar.
  - [Jobber](https://mobbin.com/screens/46b551e5-d5c6-4efc-8207-c57159c28652): Two-line rows with a type icon, name, one line of detail and a status word at the right edge.
  - [Shopify](https://mobbin.com/screens/b1bce388-5468-4881-9e33-827b4581cb3b): Phone details button on the person card, sized for a thumb.
- **Code:** `branch:src/app/(app)/contractors/page.tsx:31-63`, `branch src/app/(app)/contractors/page.tsx:8-18,31-63`, `src/app/(app)/contractors/page.tsx:31-60`, `branch:src/app/(app)/contractors/page.tsx:31-60`
- **Also found as:** JOURNEYS-040 (Lens: the core jobs, end to end), MOBILE-I03 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. At 375 only Name, Company and part of Trades show. Phone and Docs sit behind sideways scroll inside the 70vh box, and the page itself doesn't scroll (pageHeight 667 = viewport). The 'tenant fixes' chip wraps under 'David' (verify-ADMIN/dir--mobile-light.png). The Granola and Quo references fit.

### ADMIN-006

**Leaving the Move-in form tab throws away unsaved edits without asking**

High · Fix · effort S · `/settings/move-in-form` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. I re-ran the probe on /settings/move-in-form: changed 'Floor' to 'Flooring', clicked the CapEx rules tab (it navigated to /settings with no prompt), then went back to Move-in form. Every Floor field read 'Floor' again.
- **Today:** I changed 'Floor' to 'Flooring', clicked the CapEx rules tab, then came back: the field said 'Floor' again. Tabs, sidebar links, Back and reload never prompt, even though the editor already tracks a dirty flag.
- **Why:** This loses work without saying so. Stripe, Shopify and Patreon either block navigation or keep the unsaved state visible.
- **Change:** While there are unsaved changes, intercept in-app links and Back with the existing 'Discard changes?' dialog (Keep editing or Discard), and add a beforeunload prompt for reload and close. Once ADMIN-010's save bar exists, it should flash when it blocks a navigation.
- **Desktop, tablet, phone:** Same at every size; on phone the dialog is a bottom sheet.
- **Reuse:** ConfirmDialog; the dirty flag at move-in-form-editor.tsx:122.
- **References:** 
  - [Shopify](https://mobbin.com/screens/cbe5200e-30c4-4f3e-bd4e-62ff2f44341c): Unsaved changes bar with Discard and Save, kept visible until resolved
- **Code:** `Probe: fill 'Floor' to 'Flooring', click CapEx rules, click Move-in form, input value back to 'Floor'`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:122`, `src/app/(app)/settings/layout.tsx:14-21`, `branch:src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:122`, `branch:src/app/(app)/settings/layout.tsx:14-21`
- **Verification:** confirmed. Reproduced: I changed 'Cabinets' to 'Flooring test', clicked the CapEx rules tab, then Move-in form. The field was back to 'Cabinets' and no dialog appeared. Effort is likely M, not S: App Router has no built-in navigation guard, so Link clicks and Back have to be intercepted by hand. ADMIN-010's save bar is the natural home for this.

### ADMIN-I13

**Move Disconnect QuickBooks into a danger zone and say what it deletes**

High · Design change · effort S · `QuickBooks settings (/financials/settings, moving into Settings per D10)` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. controls.tsx is identical to main. Clicking Disconnect swaps in the inline row 'Also delete the synced ledger data? Keep data | Delete everything | cancel', and Escape leaves it open. QuickBooks settings are still at /financials/settings. The Settings tabs on the branch are CapEx rules, Move-in form and Storage.
- **Today:** An inline row with Keep data, Delete everything and 'cancel' replaces the Disconnect button. Either button disconnects at once and Esc does nothing. Both choices blank the P&L, rent roll and cleanup list, because reads return null once the connection is REVOKED. Delete everything also drops the class mappings.
- **Why:** A single tap can wipe the whole financial mirror. Vercel puts deletes in a red-banded card at the bottom of a settings page, with a sentence naming the consequence and a dialog that lists what goes with it. Supabase gives destructive actions their own Danger zone section.
- **Change:** The Connection card keeps only status and Refresh. Add a Danger zone card at the bottom of the QuickBooks page: 'Disconnect QuickBooks. Syncing stops. Financials keep the data from Sep 2 unless you delete it.' Its button, 'Disconnect…', opens a dialog with two radio rows: 'Keep synced data' and 'Delete synced data: the P&L, rent roll and cleanup list go empty until you reconnect'. A red button names the choice ('Disconnect and keep data'). Esc cancels.
- **Desktop, tablet, phone:** Desktop and tablet: a card at the bottom of the page and a centered dialog. Phone: the card goes full width and the dialog becomes a bottom sheet with stacked full-width buttons, the destructive one last.
- **Reuse:** ConfirmDialog (after ADMIN-032 adds Esc and focus), the danger Button variant and Card. disconnectQuickbooks(deleteData) in actions.ts stays as is.
- **References:** 
  - [Vercel](https://mobbin.com/screens/95b9c070-3863-4e9b-8de5-8fb336637b18): Integration settings end with a 'Delete Neon' card: one sentence on what is deleted, red button in a tinted footer band
  - [Vercel](https://mobbin.com/screens/8a6f2f72-5f06-4eb8-b45b-ec3ca2c64900): Delete dialog lists exactly what will be removed and revoked before the red confirm
  - [Supabase](https://mobbin.com/screens/46a6d698-2165-4a1f-9034-f82ce981b14c): Danger zone section at the bottom of settings with a plain explanation and a small red-outline button
  - [Wise](https://mobbin.com/screens/9a1210ff-734d-4e13-8e18-00de06ef3897): Connected QuickBooks account row with a single, clearly named Disconnect
  - [Stripe](https://mobbin.com/screens/e0dde01e-57c0-45c2-b45d-7a60069dbdff): "Uninstall Chargeflow?" modal: one consequence line, Cancel and a red verb.
  - [Google Drive](https://mobbin.com/screens/07fb293a-01be-475c-a762-52a770c6a3c5): "Delete forever?" states the count and that it can't be undone.
  - [Xero](https://mobbin.com/screens/33b6a9b2-b4ff-4eee-8511-f5527555116c): 'Disconnect Avalara account' is its own section that explains the consequence before the red Disconnect button.
  - [Vanta](https://mobbin.com/screens/35a83883-ca26-4326-9e31-e669e7eb7315): "Disconnect Vercel" states what stops, what's deleted, and points to Edit to keep data.
  - [Neon](https://mobbin.com/screens/f4d38e87-dd91-4e2a-a80f-e613c2899d20): Removal dialog spells out consequences above one destructive button.
  - [Linear](https://mobbin.com/screens/e64c901c-4ada-4f0a-b3a0-89a6ccf490da): The connection state '● Connected' carries a dropdown for its actions. No red button sits in the row.
- **Code:** `src/app/(app)/financials/settings/controls.tsx:31-66`, `src/app/(app)/financials/settings/page.tsx:95-98`, `branch src/app/(app)/financials/settings/controls.tsx:31-66 (identical to main)`, `branch src/app/(app)/financials/settings/page.tsx:98-100`, `branch src/app/(app)/settings/layout.tsx:14-21`, `eval after Escape: inline confirm still shown (true)`, `src/app/(app)/financials/settings/actions.ts:129-146`, `src/app/(app)/financials/settings/controls.tsx:43-66`, `src/app/(app)/financials/settings/controls.tsx:43-65`, `src/app/(app)/financials/settings/actions.ts:129-145`, `prisma/schema.prisma:484`, `src/app/(app)/financials/settings/controls.tsx:36-66`, `src/lib/quickbooks/queries.ts:75,196,275`, `src/app/api/quickbooks/callback/route.ts:44`, `src/app/(app)/financials/settings/page.tsx:96-98`, `src/app/(app)/financials/settings/controls.tsx:36-41`
- **Also found as:** FINANCIALS-017 (Financials, rent roll and financial settings), FEEL-043 (Lens: interaction quality, feedback, states, speed and accessibility), G2A-V10 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), G2A-025 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views), FINANCIALS-060 (Financials, rent roll and financial settings), G2A-I03 (QuickBooks go-live: connect, OAuth return, first sync, first mapping and the populated money views)
- **Verification:** partly. Reproduced (verify-ADMIN/qbo--disc--desktop-light.png, qbo--disc--mobile-light.png): Disconnect swaps in 'Also delete the synced ledger data?' with Keep data, Delete everything and a lowercase 'cancel'. Esc doesn't close it, both labels wrap to two lines at 375, and Keep data posts immediately (a blocked write, then the page-wide error boundary). This repeats FINANCIALS-017 (and FEEL-043, G2A), so merge them. The danger-zone placement is the only new part. The proposed copy is factually wrong. 'Keep data' sets status REVOKED, and every Financials query returns null for REVOKED (queries.ts:75,196,275), so Financials goes blank either way. 'Delete everything' also cascades classes and accounts, which loses the manual class-to-property mappings. The text must not say 'Financials keep the data from Sep 2'. The Vercel and Supabase danger-zone references are plausible.

### ADMIN-007

**A contractor's Jobs list stops at 60 with no way to see the rest**

Medium · Fix · effort S · `/contractors/[id]` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Latent, not visible today. The fix is cheap because the All list already supports the filter.
- **Today:** Jobs now come from Task.assigneeContactId. On /contractors/cmtg25y9x000djphsbqty81fr Zack has 8 open jobs and no done ones, because only imported open tasks are linked to contacts. The 60 cap isn't hit with today's data. The cap is still in the query (take: 60), though, and the header count is tasks.length. Once done jobs pile up after cutover (D18 keeps them), the list and its count will stop at 60 with no sign that more exist.
- **Why:** A contractor's job history is what you check before hiring them again, and a silent cap reads as the complete history.
- **Change:** Load open jobs uncapped and count the done ones separately. Show the latest 10 done jobs with a 'View all in Tasks' link to /tasks/all?owner=c:<contactId>&status=all. The branch's All page already filters by contractor (tasks/all/page.tsx:22-23).
- **Desktop, tablet, phone:** Same at every size; the link closes the Done group.
- **Reuse:** Tasks list filters held in the URL under src/app/(app)/tasks; Prisma TaskWhereInput.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Each section on the customer page ends with an 'N results' link to the full list
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:23-28`, `src/app/(app)/contractors/[id]/page.tsx:84-86`, `branch:src/app/(app)/contractors/[id]/page.tsx:41-49`, `branch:src/app/(app)/contractors/[id]/page.tsx:126`, `branch:src/app/(app)/tasks/all/page.tsx:22-23`
- **Verification:** partly. The cap is real, but less goes missing than implied. Open jobs always sort first (TaskStatus OPEN before DONE), so only old done history is cut. All counts on this card also depend on fixing ADMIN-017's matching first. The Stripe 'N results' pattern shows in a customer screen I pulled (https://mobbin.com/screens/f8db8469-2830-4c6b-98ca-53bf4c1e3caf).

### ADMIN-008

**CapEx cells reject bad input by silently snapping back**

Medium · Fix · effort S · `/settings (CapEx rules)` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. On /settings I typed 'Ovenx' into the Oven cell and pressed Tab. The value went back to 'Oven' with no message, no outline and no write.
- **Today:** Numeric cells that break the Monitor ≤ Replace rule or the 0–200 / $10M limits revert with no message; a typed appliance type that isn't an unused type from the hidden list also reverts. The type half is better solved by ADMIN-034's menu.
- **Why:** Nobody can tell a typo from a rule, and it can look as if the edit saved. Good forms keep what you typed and say what's wrong.
- **Change:** Keep the typed value, outline the cell in red and show one line under the row: 'Replace must be at least 9 yrs.' or 'Pick a type from the list.' Only valid values commit; Esc restores the old value.
- **Desktop, tablet, phone:** Desktop and tablet: the hint sits under the row. Phone: under the field inside the rule sheet (ADMIN-013).
- **Reuse:** The inline error line pattern (docs/components.md); the Form field layout wrapper (Known gap) once it lands.
- **References:** 
  - [Stripe](https://mobbin.com/screens/d36ef36b-d2e9-46ff-bac5-f1d715f30ec0): Inline error with a warning icon directly under the field, the typed value kept in place instead of snapping back
  - [Amazon Web Services (AWS)](https://mobbin.com/screens/d2ec2208-2e18-4961-bf69-60385a3e6f4f): Rules editor with an inline warning right beside the rows and an explicit Save rules
- **Code:** `Probe: 'Ovenx' typed into the Oven cell, Tab, value back to 'Oven'`, `src/app/(app)/settings/capex-rules-editor.tsx:113-121`, `src/app/(app)/settings/capex-rules-editor.tsx:160-171`, `src/app/(app)/settings/capex-rules-editor.tsx:237-243`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:113-121`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:160-171`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:237-243`
- **Verification:** partly. Reproduced: Replace 5 plus Enter went back to '13 yrs' with no message, and 'Ovenx' plus Tab went back to 'Oven'. The editor is rarely used and the value visibly snaps back, so medium fits better than high. The type case overlaps ADMIN-034: with a menu there, 'Pick a type from the list' never shows. Keep the inline error here for numbers only.

### ADMIN-009

**Turn Settings into a Stripe-style index that absorbs QuickBooks**

Medium · Design change · effort M · `/settings, /settings/move-in-form, /settings/storage, /financials/settings` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /settings still opens on CapEx rules under TopTabs (CapEx rules, Move-in form, Storage), with the H1 'Settings' and the subtitle 'CapEx planning rules'. QuickBooks settings still live at /financials/settings. The branch only added a requireUser() there.
- **Today:** Accurate as written; severity is lower because Settings is a low-traffic area and the direction is already approved in D10.
- **Why:** Stripe's settings home says in one line what each area controls and gets you there in one click; Linear and Vercel give every settings page its own title. The approved direction (D10) merges Settings with QuickBooks.
- **Change:** Make /settings an index with two groups. Portfolio: 'CapEx rules: replacement ages and costs for forecasts' and 'Move-in form: rooms and items tenants rate'. Connections: 'QuickBooks' with a status chip and last sync, and 'Files: all documents private'. Contractor portal settings join later. Each subpage gets a 'Settings' breadcrumb and its own H1 ('CapEx rules'), and the settings TopTabs go away.
- **Desktop, tablet, phone:** Desktop 1280: two groups of cards in a 3-column grid, about 960px max. Tablet 768: 2 columns. Phone 375: grouped list rows with a value and chevron, and no wrapping tabs at 320.
- **Reuse:** Card, PageHeader, and BackLink as the breadcrumb; move financials/settings/page.tsx to /settings/quickbooks; Badge for connection status.
- **References:** 
  - [Stripe](https://mobbin.com/screens/61d8519b-582c-4749-a1df-1ff712e3a810): Settings index grouped by area, each entry a title plus a one-line description
  - [Stripe](https://mobbin.com/screens/17d376c5-8ccf-43a7-8370-0bbba9d8beca): 'Settings ›' breadcrumb above each settings page's own H1
  - [Base](https://mobbin.com/screens/3f573b95-4bbb-4978-957e-56178543e8e7): Phone settings rows with a sublabel, the current value and a chevron
  - [Mercury](https://mobbin.com/screens/0bba63f7-93ad-4385-872c-0d97249f019a): Settings replaces the sidebar with its own list behind a back arrow ('Settings'), grouped Company and Personal, so the main nav stays short.
  - [Vercel](https://mobbin.com/screens/abbadfbe-0db6-453b-b9bc-ccb7ce2d60ed): Same drill-in idea for a sub-area: the sidebar swaps to the section's own items under a back row, then returns.
  - [Linear](https://mobbin.com/screens/e6325df4-b56e-4d43-b2a4-bab4c5f9e359): Settings index rows with chevrons and value summaries ('6 statuses').
  - [Linear](https://mobbin.com/screens/abf277ec-d00a-4504-8cfa-54930315f0ab): Settings shell with 'Back to app' and grouped left nav.
  - [HoneyBook](https://mobbin.com/screens/f3b6bb86-fc03-4442-9594-800a90b93115): QuickBooks as its own named section.
  - [Mercury](https://mobbin.com/screens/5dca96bc-dcc4-4567-afeb-ad744b7e9f8f): Books Details in Settings: label and one-line helper on the left, value and Edit on the right. Start date, Accounting basis and Close date all live there.
  - [Mercury](https://mobbin.com/screens/cb40503d-fd6c-437c-bbba-aaec53ce22f3): Integrations is a Settings page, and the active accounting connection is one row at the top.
  - [Wise](https://mobbin.com/screens/9a1210ff-734d-4e13-8e18-00de06ef3897): QuickBooks connection lives in a settings page, not in reports
  - [Acctual](https://mobbin.com/screens/78868383-2fad-4b4a-a527-5c77e4ca5d18): Settings > Accounting tab holds the connection
- **Code:** `src/app/(app)/settings/layout.tsx:14-21`, `src/app/(app)/settings/capex-rules-editor.tsx:301-309`, `branch:src/app/(app)/settings/layout.tsx:14-21`, `branch: docs/asana-migration-plan.md:487-494`, `src/app/(app)/financials/layout.tsx:14-21`, `src/app/(app)/settings/layout.tsx`
- **Also found as:** IA-023 (Lens: information architecture and global SaaS patterns), FINANCIALS-045 (Financials, rent roll and financial settings)
- **Verification:** partly. Every observation checks out: TopTabs above an H1 that always says 'Settings', Financials putting its H1 above its tabs, QuickBooks under /financials/settings, and tab labels wrapping at 320. Two Stripe settings screens I pulled support the breadcrumb plus own-H1 pattern (https://mobbin.com/screens/e72d80ed-0621-4737-9e7f-e98066486f8e and https://mobbin.com/screens/fc7b35c9-f823-4f28-bb16-d981a05cb530). They also show Stripe keeping tabs inside a subpage. This carries out D10's settled merge, and Settings is visited rarely, so medium.

### ADMIN-010

**One save model for Settings: local edits plus an Unsaved changes bar**

Medium · Design change · effort M · `/settings (CapEx rules), /settings/move-in-form` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. Both editors are unchanged. CapEx commits each cell on its own, and the move-in form keeps its always-on Save and Cancel.
- **Today:** Accurate; calibrated to medium because both editors are rarely used and the data-loss parts are already filed as ADMIN-001 and ADMIN-006.
- **Why:** Two different behaviors on sibling tabs leave people unsure whether anything saved. Shopify, Patreon and Stripe show unsaved state only when there is some, and confirm a save.
- **Change:** Both editors keep edits local. When something changes, a bar appears with 'Unsaved changes', Discard and Save. Saving shows a toast naming the effect: 'CapEx rules saved. Forecasts updated.' or 'Move-in form saved. Tenants see it now.' The always-on Save and Cancel go away; Esc in a cell still restores that one cell.
- **Desktop, tablet, phone:** Desktop and tablet: the bar is pinned under the top bar across the content width. Phone: it is pinned to the bottom edge with two full-width buttons, clear of the home indicator.
- **Reuse:** Button; Toast (approved as new in the Asana plan reuse check); ConfirmDialog for Discard.
- **References:** 
  - [Shopify](https://mobbin.com/screens/cbe5200e-30c4-4f3e-bd4e-62ff2f44341c): Unsaved changes with Discard and Save in the top bar, shown only while dirty
  - [Patreon](https://mobbin.com/screens/81caef5b-3649-46de-9f10-3df0f40ae47c): Top banner 'You have unpublished changes' with Discard and Save
  - [Vercel](https://mobbin.com/screens/42170271-f4d5-45f9-bd85-38f0a55bd655): Short toast confirming a settings change
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:155-168`, `src/app/(app)/settings/capex-rules-editor.tsx:208-223`, `branch:src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:155-168`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:208-223`, `branch:src/components/toast.tsx`
- **Verification:** partly. Verified: Cancel is enabled when nothing changed, Save loads disabled and faded, a save shows nothing, the page is 2,311px tall, and Save and Cancel wrap under the subtitle at 320. The Shopify references match a Shopify unsaved-changes bar and a 'Rules saved successfully' toast I pulled (https://mobbin.com/screens/f9b025cd-5cf4-4dfd-a469-b52ea937cc99 and https://mobbin.com/screens/e53a5210-9e2c-405c-ab2d-87de1432dd5e). Moving CapEx from autosave to explicit save changes behavior and needs Connor's OK. It would also cover ADMIN-006 and make the instant CapEx delete recoverable.

### ADMIN-011

**Put Call, Text and Email in the contractor record's header**

Medium · Design change · effort S · `/contractors/[id]` · One record layout for every record

- **Migration branch:** Still applies on the migration branch. The /contractors/[id] header is still the back link 'Contractors', then the H1, the company in muted text and the green 'tenant fixes' chip. There is no Call, Text or Email anywhere in the header. The only actions on the page are in the Portal access card.
- **Today:** Accurate; the core job (one tap to call) is delivered by ADMIN-004, so this is a medium design upgrade on top.
- **Why:** Stripe's customer page and Jobber's client page both lead with the actions you take on that record.
- **Change:** Name as the H1, with one muted line under it for company and top trades. On the right: Call, Text and Email as secondary buttons, plus a ... menu (Edit, Archive). Call and Text hide when there's no phone, Email when there's no email.
- **Desktop, tablet, phone:** Desktop and tablet: buttons right of the title. Phone: three labeled round buttons (Call, Text, Email) in a full-width row under the name.
- **Reuse:** LinkButton with tel:, sms: and mailto: hrefs; lucide-react icons; React Aria menu (D9) for the ... menu.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Customer header with action buttons and a ... menu at the right
  - [Beside](https://mobbin.com/screens/4a458dba-3b10-49ef-9038-2291f5d830d4): Call, Chat, Email labeled round buttons under the name on phone
  - [Jobber](https://mobbin.com/screens/4ee9338b-de48-4168-9069-38d3307446ff): Field-service client record with Email, Edit and More Actions in the header
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:32-39`, `branch:src/app/(app)/contractors/[id]/page.tsx:53-60`
- **Verification:** partly. The header has no actions (verify-ADMIN/zack--desktop-light.png). This overlaps ADMIN-004: tap-to-call on the Contact card covers the main job with no new chrome. Header buttons are an additional design step. The Stripe header-actions pattern matches a customer page I pulled (https://mobbin.com/screens/ed53af21-56c6-479b-b49f-3c5ab4c875f3).

### ADMIN-012

**Make CapEx rules a real numeric table with right-aligned Geist Mono figures**

Medium · Design change · effort S · `/settings (CapEx rules)` · Money, numbers and dates read one way

- **Migration branch:** Still applies on the migration branch. The CapEx editor on /settings is unchanged. Name fills the card width, and Monitor, Replace and Cost are left-aligned text inputs ('9 yrs', '$1,000') pushed to the far right of a full-width card.
- **Today:** Accurate; severity calibrated to medium.
- **Why:** Stripe and Ramp tables right-align figures in tabular numerals so they compare at a glance, and the house rule says Geist Mono for figures. The property page's own CapEx forecast table already right-aligns cost.
- **Change:** Cap the editor at about 720px. Name takes the flexible width; Monitor, Replace and Cost get fixed widths, right-aligned, in font-mono tabular-nums, with headers in the Th style on the same padding as the text. Cells read as text and turn into an input in the same box when clicked, so nothing shifts.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the table at 720px max. Phone 375: list rows with a sheet editor (ADMIN-013).
- **Reuse:** Th and Td in src/components/ui.tsx; the right-aligned Cost column in properties/[id]/capex-outlook.tsx; fmtMoney; fold fmtYrs and fmtAge into lib (Duplicates).
- **References:** 
  - [Rows](https://mobbin.com/screens/989ac286-a8ea-4e77-b8f1-a030bd50545c): Numeric columns right-aligned under a light header row
  - [Linear](https://mobbin.com/screens/f3134ca3-b7e5-47ab-a283-92ce2db403db): Settings content in a centered column of fixed width
  - [Stripe](https://mobbin.com/screens/4faf8630-06a3-4a56-8271-b6cd5bec3a25): Label/value rows sized to content
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:26-28`, `src/app/(app)/settings/capex-rules-editor.tsx:184-192`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:26-28`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:184-192`
- **Also found as:** DATA-063 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. Verified on desktop: headers start at x=943 and values at x=950, money is left-aligned and not mono, and figures are crammed at the right edge of a 1,100px row. This is a house-rule gap (Geist Mono for figures) on a rarely visited editor, so medium. The Rows and Linear references are generic but fit.

### ADMIN-013

**On phones CapEx hides Cost and Delete; use rows that open a sheet**

Medium · Design change · effort M · `/settings (CapEx rules)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. At 375 on /settings, the Appliances and Building systems cards show Name, Monitor and Replace only. Cost and the delete control are cut off at the card edge.
- **Today:** Accurate; severity calibrated to medium for a rarely used phone task.
- **Why:** Cost is the number that matters most. iOS settings patterns show the value on the row and do the editing on a detail sheet.
- **Change:** Below 640px each rule is a row: the name on the left, '9 / 13 yrs · $1,000' in mono on the right, and a chevron. Tapping opens a bottom sheet with Monitor, Replace and Cost fields (numeric keypad) and 'Delete rule' at the bottom.
- **Desktop, tablet, phone:** Desktop and tablet keep the table (ADMIN-012). Phone uses rows and the sheet, with nothing scrolling sideways at 320.
- **Reuse:** React Aria sheet (D9); Input with inputMode numeric.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/69322221-028e-49bf-a1ab-ab7acd8ae0c7): Single-purpose sheet for one property, large rows, check on the current value
  - [Linear Mobile](https://mobbin.com/screens/a8d2df88-10dc-4ac7-8cfb-4011f0082501): Bottom sheet of grouped label/value rows, the shape for editing one CapEx rule's Monitor, Replace and Cost on a phone
  - [TextNow](https://mobbin.com/screens/ad5aa6e3-c55c-441c-ac9e-691473e07f92): Grouped settings rows with trailing values and chevrons
  - [Base](https://mobbin.com/screens/3f573b95-4bbb-4978-957e-56178543e8e7): Row label left, current value and chevron right
- **Code:** `branch:src/components/sheet.tsx:1-40`
- **Verification:** partly. Verified at 375: the Cost column is cut off (verify-ADMIN/capex--mobile-light.png). After tapping into a row, the trash button sits at x=463 on a 375px viewport. Editing CapEx rules on a phone is rare, so medium.

### ADMIN-014

**Move-in form editor: a compact editor beside a live tenant preview**

Medium · Design change · effort M · `/settings/move-in-form` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. /settings/move-in-form is the same single-column editor with no tenant preview.
- **Today:** Accurate; calibrated to medium.
- **Why:** Stripe's customer portal settings and survey builders such as Maze and Sprig put the controls next to the result, so you edit with confidence.
- **Change:** Desktop gets two panes. The left pane (about 520px) holds the sections as collapsible groups with a summary line ('Kitchen · 15 items · Required'). The right pane is a sticky preview that renders the real tenant form at phone width, with 'Open form' linking to the public page.
- **Desktop, tablet, phone:** Desktop 1280: editor plus preview. Tablet 768: editor only, with a 'Preview' button that opens the preview in a sheet. Phone 375: like tablet, with sections collapsed by default.
- **Reuse:** The public form in src/app/(marketing)/residents/moving-in/move-in-form.tsx, rendered read-only as the preview; SectionCard for the groups.
- **References:** 
  - [Jobber](https://mobbin.com/screens/57c3b974-9720-4fd3-abad-71ee405368f8): Client hub settings: toggles on the left, a live Preview of what the client sees on the right, one Update Settings button
  - [Stripe](https://mobbin.com/screens/17d376c5-8ccf-43a7-8370-0bbba9d8beca): Customer portal settings with a live preview pane on the right
  - [Maze](https://mobbin.com/screens/43596365-445e-4231-b020-fce1d1e201b7): Block list, editor and live preview side by side
  - [Sprig](https://mobbin.com/screens/d1276233-7e24-4080-8d76-dabfeec62971): Question editor with a study preview beside it
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:30-106`, `branch:src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:30-106`
- **Verification:** partly. Verified: 46 items, a 2,311px page, and no link to /residents/moving-in. The public form exists at src/app/(marketing)/residents/moving-in/move-in-form.tsx and could render as the preview. The preview pane would show the near-black and gold public palette inside the app, which is acceptable for a preview. M effort, a nice capability, not high.

### ADMIN-016

**Two 'Roof' rules with different costs sit in the same list**

Medium · Fix · effort S · `/settings (CapEx rules)` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. Building systems on /settings still has two unlabeled Roof rules: 'Roof | 15 yrs | 20 yrs | $20,000' and 'Roof | 15 yrs | 20 yrs | $25,000'. The stray 'New system' row sits between them.
- **Today:** Two Roof rules ($20,000 per-unit equipment rule, $25,000 building rule) sit unlabeled in Building systems. That a dated roof is counted twice in the forecast is not verified.
- **Why:** Two prices for the same thing in one list means nobody knows which one feeds the forecast, and a roof dated in both places is counted twice.
- **Change:** Split the section into two labeled groups, 'Per unit' (Roof, Furnace, Boiler, HVAC, Water Heater) and 'Per building' (Roof, Windows, Electrical service and the rest). If both roof rules are real, keep each under its group. If not, drop the per-unit Roof once no unit uses it.
- **Desktop, tablet, phone:** Same at every size: group labels are small subheads in the table, and section headers in the phone list.
- **Reuse:** BUILDING_LIKE_EQUIPMENT in capex-rules-editor.tsx; Th-style subheads.
- **References:** 
  - [Lifesum](https://mobbin.com/screens/c7c496e0-364e-4412-8206-848b30d0f3d0): Settings split into clearly labeled groups
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:18-24`, `src/app/(app)/settings/capex-rules-editor.tsx:364-389`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:18-24`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:364-389`, `src/app/(app)/settings/capex-rules-editor.tsx:225-226,292`
- **Also found as:** COPY-050 (Lens: words on every screen), DATA-037 (Lens: tables, numbers, money, charts and status)
- **Verification:** partly. Both Roof rows are on screen: $20,000 for the per-unit equipment rule and $25,000 for the building rule. I couldn't verify that a roof dated in both places gets counted twice. Splitting the section into labeled groups changes the layout, so kind should be design, not fix. The Lifesum reference (a fitness app) is weak; a Stripe settings screen with grouped rows, such as https://mobbin.com/screens/fc7b35c9-f823-4f28-bb16-d981a05cb530, would back it better.

### ADMIN-019

**Group a contractor's jobs into Open and Done instead of 56 struck-through rows**

Medium · Design change · effort S · `/contractors/[id]` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Open rows now have a StatusBadge in a fixed spot before the date ('To do', 'In progress'), and the list is sorted by status. Done rows still get line-through and no chip, and there's no Open/Done grouping or count. In the branch data no contractor has a linked done job, so the struck-through rows don't show yet. They'll come back as jobs are approved after cutover.
- **Why:** Linear groups by status with counts and lets Done collapse. Strikethrough across dozens of rows reads as noise.
- **Change:** Render the list with TaskRow inside a TaskListProvider, as Today and All do. Split it with the branch's SegmentedControl ('Open' and 'Done' with counts), which matches the approved My jobs Open | Done pattern. Drop the strikethrough.
- **Desktop, tablet, phone:** Desktop and tablet: one-line rows. Phone: two-line rows (ADMIN-020). Group headers stay sticky inside the card on all sizes.
- **Reuse:** Badge with the approved status tones (Asana plan reuse check); the Tasks list row if it fits.
- **References:** 
  - [Linear](https://mobbin.com/screens/ef923b0e-9a40-4fdd-80f2-f3aafb4f36ce): In Progress, Todo and Done groups with counts
  - [Linear](https://mobbin.com/screens/610d34b6-6ad8-45ab-80fb-2107b31ed01e): Collapsible status group headers with a fixed status icon per row
  - [Linear](https://mobbin.com/screens/937fc32e-04c6-4c39-bcd6-17a42b4fe83c): Done issues grouped under a 'Done' header with a count.
  - [Linear](https://mobbin.com/screens/d1d26f7d-e1e5-490f-ab4f-c96dd12854c1): "Done 11" as its own group with check icons, no strikethrough
  - [Linear](https://mobbin.com/screens/1c951621-7b10-4f56-8dc7-b52094872e17): Assigned issues grouped by state with counts ('Other active 3')
  - [Jira Cloud](https://mobbin.com/screens/8d73769f-ed59-41fa-b475-b0697d6b9ad9): Explicit DONE / TO DO status words next to dates on phone
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:92-114`, `branch:src/app/(app)/contractors/[id]/page.tsx:49`, `branch:src/app/(app)/contractors/[id]/page.tsx:133-157`, `branch:src/components/segmented-control.tsx`, `src/app/(app)/contractors/[id]/page.tsx:97`, `branch src/app/(app)/contractors/[id]/page.tsx:42-49`, `branch src/app/(app)/contractors/[id]/page.tsx:133-155`, `src/app/(app)/contractors/[id]/page.tsx:94-100`, `branch:src/app/(app)/contractors/[id]/page.tsx:41-49`, `branch:src/app/(app)/contractors/[id]/page.tsx:134-141`, `src/app/(app)/contractors/[id]/page.tsx:87-120`, `src/app/(app)/contractors/[id]/page.tsx:41-49,123-160`, `src/app/(app)/tasks/task-section.tsx:11-61 (collapsible group to reuse)`, `src/app/(app)/contractors/[id]/page.tsx:83-113`, `branch src/app/(app)/contractors/[id]/page.tsx:41-49, 123-160`
- **Also found as:** VISUAL-048 (Lens: visual design system across every screen), VISUAL-IV07 (Lens: visual design system across every screen), DATA-042 (Lens: tables, numbers, money, charts and status), COPY-036 (Lens: words on every screen)
- **Verification:** partly. The dark-mode claim is overstated: done rows are rgb(139,143,150) on rgb(11,12,14) and read clearly (verify-ADMIN/zack--desktop-dark.png). The rest holds: 56 of 60 rows struck through and no status chip. Build this together with ADMIN-020. The Linear references fit.

### ADMIN-020

**On phones job titles are cut to about ten characters**

Medium · Design change · effort S · `/contractors/[id]` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** At 375 on /contractors/cmtg25y9x000djphsbqty81fr, the property link is hidden below sm, so titles get about 20 characters before the cut: '58 Mariner Cabinet an…', 'Repair fascia boards a…', 'fix front steps at 767 p…'. They are still cut, and the property no longer shows anywhere on a phone. The gray status chip and a fixed 96px date column take the rest of the line.
- **Why:** The title is the only way to tell jobs apart, and on a phone you need to read it at a glance.
- **Change:** Use TaskRow's phone layout: the title on top, wrapping, then 'property · status · date' muted below.
- **Desktop, tablet, phone:** Desktop and tablet keep one-line rows. Phone gets two lines.
- **Reuse:** shortAddress in src/lib/normalize.ts; the job row from ADMIN-019.
- **References:** 
  - [Shopify](https://mobbin.com/screens/8d012513-7214-4c00-935d-aaa2307452f9): Two-line rows on iOS let the title use the full width while secondary facts move to line two
  - [Jobber](https://mobbin.com/screens/66b55c90-a7e6-43e6-aab9-a8c03bf5a7fb): Schedule rows: job title over a 're:' sublabel, date and assignee in their own column, completed items grouped under 'Completed Today'
  - [LinkedIn](https://mobbin.com/screens/78fbbff0-db36-47f6-a6b8-fe7731dbfeae): Two-line rows: the primary text over a muted descriptor
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:94-112`, `branch:src/app/(app)/contractors/[id]/page.tsx:136-155`
- **Verification:** confirmed. At 375 titles truncate to 'Melvin? Coordinat…' and 'Repair Drywall an…' (verify-ADMIN/zack--scrolled--mobile-light.png). This is the same row redesign as ADMIN-019, so ship them together. The LinkedIn reference is generic but enough for a two-line row.

### ADMIN-021

**Contractor record layout: a details rail on the right, sized to its content**

Medium · Design change · effort S · `/contractors/[id]` · One record layout for every record

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. No approved design is affected. The Portal access card itself was approved (batch item 2), but where it sits on the page wasn't specified.
- **Today:** The left column now stacks a Contact card and a Portal access card, each sized to its content. The Jobs card (lg:col-span-2) now stretches instead. At 1280 it is 763px tall, but its last row ends at y=493, leaving about 420px of empty card. The details are still on the left, not in a right rail. Contact still lists all eight label and value pairs with '—' for empties (Device Check Contractor shows eight dashes). On tablet and phone the order is Contact, Portal access, then Jobs, so Jobs starts about 900px down at 768 and about 945px down at 375.
- **Why:** Stripe and Attio put the work (here, jobs) in the main column and the details in a compact right rail, and they hide empty fields or turn them into an inline add prompt.
- **Change:** Put Jobs in the main column (self-start). Use a 320px right rail for the details with empty fields hidden, then Documents, then Portal access. On tablet and phone, put Jobs before the details, or fold the details into one line plus Call and Text.
- **Desktop, tablet, phone:** Desktop 1280: two columns with the rail on the right. Tablet 768: the rail becomes a two-column details grid above Jobs. Phone 375: header buttons, details two-up, then Jobs.
- **Reuse:** Card; Field (skip null values or add a hideEmpty prop); self-start on the grid item.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Main sections on the left, Insights and Details rail on the right
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Record Details rail beside the activity column
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:41-80`, `branch:src/app/(app)/contractors/[id]/page.tsx:62-162`
- **Verification:** confirmed. Measured: the Contact card is 2,266px tall for 554px of content, because it stretches to the Jobs card. On tablet it is a single column about 520px tall above Jobs. Steve Fuller's two cards are both 536px. The Stripe and Attio rail references fit; the Stripe pattern matches https://mobbin.com/screens/ed53af21-56c6-479b-b49f-3c5ab4c875f3.

### ADMIN-022

**W-9 shows '—' while the note says the W-9 is on file**

Medium · Fix · effort S · `/contractors/[id]` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. Partly fixed in 9f74ea1: on the record page, W-9 and COI now read 'On file' when the notes hold the importer's 'W-9 on file:' or 'Insurance on file:' line, so Jose Alvarez no longer shows '—'. Still open: the note lines aren't removed (Jose and Zack Reading both still show the residue), there's no cleanup script for them, a missing doc still shows '—' rather than 'Missing', and the directory's Docs column still shows '—' for Jose. Whether this should be a field is Connor's call. Jose Alvarez's record still shows W-9 '—' above the note 'W-9 on file: fw9_Final Touch Home Renovations LLC.pdf'. Zack Reading's shows W-9 'View ↗' with the leftover note 'W-9 on file: Scanned Jul 24, 2025 at 7:48:30 AM - Zachary Reading.pdf'.
- **Today:** Jose Alvarez shows W-9 '—' while his note says the W-9 is on file; Zack Reading's W-9 is linked and his note just repeats it as import residue.
- **Why:** The record contradicts itself about a tax document, and the notes field holds import residue instead of things a person wrote.
- **Change:** Run a one-off cleanup that turns 'W-9 on file: …' note lines into W-9 status (On file, with the filename and no link when there isn't one) and removes them from the notes. Show W-9 as 'On file', 'View' or 'Missing'.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** Contact.w9Url and comments; the importer in scripts/migrate/02-contractors.ts.
- **References:** 
  - [Jobber](https://mobbin.com/screens/a0b4e24f-d840-4163-b198-5b0a6fbfab83): Notes sit under a labeled 'Internal notes' heading with the author and a 'Created' timestamp, so an imported note can't pass for a field value.
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): 'Source: Manually entered from Dashboard' shows how to label provenance next to the facts.
  - [Airwallex](https://mobbin.com/screens/286065f4-2153-4d1c-a662-adaa1f567f12): Missing vendor info flagged inline as 'Missing'
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:54-77`, `branch:src/app/(app)/contractors/[id]/page.tsx:76-99`, `branch src/app/(app)/contractors/[id]/page.tsx:76-99`, `src/app/(app)/contractors/[id]/page.tsx:54-62`, `scripts/migrate/02-contractors.ts:121-122`, `Local DB: Contact rows with comments like 'W-9 on file%' = 12; w9Url set = 3`, `4652abb:scripts/migrate/02-contractors.ts:118-122`, `4652abb:src/app/(app)/contractors/[id]/page.tsx:76-100`
- **Also found as:** COPY-037 (Lens: words on every screen), G1D-IV01 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** partly. Jose Alvarez's record contradicts itself: W-9 '—' with a note saying 'W-9 on file: fw9_Final Touch Home Renovations LLC.pdf'. Zack's W-9 is linked ('View ↗'), so his note is only redundant import residue, not a contradiction. The cleanup recommendation stands.

### ADMIN-023

**Clean up imported contractor data: duplicated trades and lowercase names**

Medium · Fix · effort S · `/contractors, /contractors/[id]` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. Partly fixed in 9f74ea1: repeated trades are dropped on display, both importer merge passes now de-dupe the same way, and scripts/cleanup-contacts.ts lists (and with --apply writes) de-duped trades and capitalized lowercase name words. It's a dry run by default and is gated for production. Still open: nobody has run it, so 'John detzler' and the others still show lowercase. It doesn't move trade words out of Company ('Electric', 'House Cleaner') or map trades to the ADMIN-024 list, and the production run is Connor's. /contractors on the branch has the same imported data. Duplicated trades: 'HVAC / HVAC' (Steve Fuller), 'Electric / Electric' (Jeremiah Anderson, Mike Morris) and 'Demo/Framing/Trim / Framing/General/Tile/Drywall/Trim' (Zack Reading). Lowercase names: 'John detzler', 'Jacob (Jake) hoak', 'William Antonio hurtado chavez'. Trade words in Company: 'Electric' (Jeremiah Anderson) and 'House Cleaner' (Kim Lockett).
- **Today:** Trades read 'HVAC / HVAC', 'Electric / Electric' and 'Demo/Framing/Trim / Framing/General/Tile/Drywall/Trim'. Names include 'John detzler', 'Jacob (Jake) hoak' and 'William Antonio hurtado chavez'. 'Electric' and 'House Cleaner' appear as company names. The importer's first merge pass joins trades without removing duplicates; the second pass does remove them.
- **Why:** Sloppy data makes a premium-looking app feel unfinished, and duplicated trades break any trade filter.
- **Change:** Write a one-off script that splits trades on '/', removes duplicates case-insensitively, maps them to the trade list in ADMIN-024, title-cases names and moves trade words out of Company. Make line 81 de-dupe the way line 155 does.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** scripts/migrate/02-contractors.ts merge passes.
- **References:** 
  - [Square](https://mobbin.com/screens/ed99d05a-2542-4092-b00d-57e0281b30b6): Clean single-value columns in a vendor list
- **Code:** `scripts/migrate/02-contractors.ts:81`, `scripts/migrate/02-contractors.ts:155`, `branch:scripts/migrate/02-contractors.ts:81`, `branch:scripts/migrate/02-contractors.ts:155`, `branch src/app/(app)/contractors/page.tsx:48-52`, `branch src/app/(app)/contractors/[id]/page.tsx:58, 70`, `branch src/components/assignee-picker.tsx:213`, `branch src/lib/tasks/assignee-options.ts:34`
- **Also found as:** COPY-039 (Lens: words on every screen)
- **Verification:** confirmed. Seen in the directory: 'Electric / Electric', 'HVAC / HVAC' on Steve Fuller, 'Electric' as a company, and lowercase surnames. The importer joins at line 81 without removing duplicates and dedupes at line 155. 'Mike Morris (Freedom Electric)' also carries the company inside the name.

### ADMIN-024

**Add search and a Trade filter to the directory (the page already reads ?q=)**

Medium · Design change · effort S · `/contractors` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. /contractors still has no search field or Trade filter. The page still reads ?q= with nothing on screen to set it. Trades are still one free-text string per contractor.
- **Today:** The directory has no search field or filters. The page already filters by name, company and trade when given ?q= (/contractors?q=plumb returns 4 rows), but nothing on screen sets it. Trades are free text, so 'Plumbing', 'Plumber/minor HVAC' and 'Exterior Plumbing' don't group together.
- **Why:** 'Who does plumbing?' is the main lookup. Stripe and Square put a search field and filter chips above the list.
- **Change:** Add a search field ('Search name, company or trade') and a Trade filter chip. Back the chip with a fixed trade list stored as an array: Plumbing, Electric, HVAC, Carpentry, Paint, Flooring, Cleaning, Landscaping, Pest, Snow. Trades show as up to two neutral chips plus '+N'.
- **Desktop, tablet, phone:** Desktop and tablet: search and chips in one row that never wraps. Phone: a full-width search field and a Filters button that opens a sheet.
- **Reuse:** Input (the small size for filter bars, see Duplicates); StatusMultiSelect moved into components/ for the Trade picker; the existing ?q= handling.
- **References:** 
  - [Stripe](https://mobbin.com/screens/d412df8a-c1d6-4d9c-af5d-04fd317f627f): Add-filter chips above the customer list with a result count
  - [Square](https://mobbin.com/screens/ed99d05a-2542-4092-b00d-57e0281b30b6): Filter by vendor name plus a Show archived toggle
  - [Linktree](https://mobbin.com/screens/2661917c-6c50-4c3f-a5d9-52cfcf6c5a1e): Search field plus a filter button that opens a bottom sheet on phone
  - [Mercury](https://mobbin.com/screens/ad20eb69-7c68-4d3b-b0bb-7eb11c3e60e7): Search field directly under the list title.
- **Code:** `src/app/(app)/contractors/page.tsx:8-20`, `branch:src/app/(app)/contractors/page.tsx:8-20`, `branch:prisma/schema.prisma:191`, `src/app/(app)/contractors/page.tsx:10-16`, `src/app/(app)/contractors/page.tsx:24`, `branch: src/app/(app)/contractors/page.tsx:24-28`
- **Also found as:** IA-028 (Lens: information architecture and global SaaS patterns)
- **Verification:** confirmed. /contractors?q=plumb returns 4 rows, and nothing on the page sets it. A fixed trade list means a schema change (trades text to an array) plus ADMIN-023's cleanup, so effort is closer to M. The Stripe filter-chip pattern matches https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c.

### ADMIN-027

**Rework the directory columns around decisions: open jobs and last job**

Medium · Design change · effort S · `/contractors` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. The directory columns are unchanged: Name, Company, Trades, Phone, Docs. Company is '—' for 16 of the 29 real contractors (18 of 31 rows with the two local fixtures). There is still no open-jobs, last-job or portal column.
- **Today:** The columns are Name, Company, Trades, Phone and Docs. Company is '—' for 16 of the 29 contractors but still takes about 230px, and nothing shows how busy a contractor is or when you last used them.
- **Why:** Melio shows 'Last paid' and unpaid bills on every vendor row, and that kind of fact is what decides who to call.
- **Change:** Columns: Name with the company as a muted second line, Trades (chips), Open jobs (a count linking to Tasks), Last job (date), Portal (ADMIN-015) and Phone. Drop the Company column.
- **Desktop, tablet, phone:** Desktop 1280: all columns. Tablet 768: Name, Trades, Open jobs and Phone. Phone 375: list rows (ADMIN-005).
- **Reuse:** Table, Th and Td; job counts from a groupBy on the real assignment.
- **References:** 
  - [Mercury](https://mobbin.com/screens/ee13c597-f333-4830-8faa-7265e283e2b1): Recipients list with a right-aligned 'Total paid' column and an initials avatar per payee: the decision columns for a vendor list
  - [Clerk](https://mobbin.com/screens/489a3e32-c494-4f43-bffb-7ddc46d4abd5): Identity cell stacks name over email beside an avatar, with a Columns menu for the rest
  - [Melio](https://mobbin.com/screens/2877a252-2ceb-41c9-85e4-54384856fcf5): Vendor rows with Last paid and Unpaid bills columns
  - [QuickBooks](https://mobbin.com/screens/a5de8e82-01ab-44ca-a68c-82fa9753cab2): Supplier list with phone and open balance per row
  - [Stripe](https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c): Customers table: Payments count and Last payment right-aligned beside name and email.
- **Code:** `src/app/(app)/contractors/page.tsx:33-40`, `branch:src/app/(app)/contractors/page.tsx:33-39`, `src/app/(app)/contractors/page.tsx:34-38`, `branch-src/src/app/(app)/contractors/page.tsx:31-39`
- **Also found as:** DATA-I08 (Lens: tables, numbers, money, charts and status)
- **Verification:** confirmed. 16 of 29 contractors have no company, and the Company column is 228px wide. Order matters: Open jobs and Last job will show wrong numbers until ADMIN-017 matches on real assignment (Brandon Zarbo would show Brandon Kmiotek's work).

### ADMIN-028

**Make the whole directory row open the record**

Medium · Design change · effort S · `/contractors` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. On /contractors only the name text is a link. 'Alison Hurtado' measures 97x18px at 1280, and the first name link measures 53x38px at 375. The rest of each row highlights on hover but does nothing when clicked.
- **Today:** Only the name text is a link (for 'David' that is a 53 by 38px target). The rest of the row highlights on hover but does nothing when clicked.
- **Why:** Mercury and Stripe lists open the record from anywhere on the row, which also gives touch users a big target.
- **Change:** Make the whole row the link target, with a chevron that appears on desktop hover. The phone number keeps its own tel: link. Rows are focusable and Enter opens them.
- **Desktop, tablet, phone:** Desktop: row link and hover chevron. Tablet: row tap. Phone: list row tap (ADMIN-005).
- **Reuse:** Table rows plus Next Link.
- **References:** 
  - [Mercury](https://mobbin.com/screens/0546a342-6b5a-47c3-8d95-4871d6eb59d5): A trailing chevron marks the whole row as opening the vendor
- **Code:** `Probe at 375: first name link measures 53 x 38px`, `src/app/(app)/contractors/page.tsx:43-50`, `branch:src/app/(app)/contractors/page.tsx:43-50`, `branch:src/app/(app)/tasks/task-row.tsx:72-77`
- **Verification:** confirmed. Only the name is a link: 97x18px on desktop, and 53x38px for the first row at 375. Rows highlight on hover but do nothing when clicked.

### ADMIN-029

**Track COI and W-9 as statuses with expiry, not bare Drive links**

Medium · New capability · effort M · `/contractors, /contractors/[id]` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The Docs column still shows blue Drive links for 5 contractors: Zack Reading ('W-9 · COI'), John detzler and Vincent Grant ('COI'), Kenneth Gonzalez and Kevin Fawcett ('W-9'). The record shows 'View ↗' with no expiry or status.
- **Today:** The Docs column shows 'W-9', 'COI' or 'W-9 · COI' as blue links to Google Drive for 5 of the 29 contractors, and the record says 'View ↗'. There is no expiry and no status, so a lapsed COI looks exactly like a current one.
- **Why:** An insurance lapse is the compliance risk with contractors. Airwallex keeps a vendor's documents in their own tab, and the plan already schedules 'W-9 and COI tracking through the portal'.
- **Change:** Documents go in the record rail. W-9 shows 'On file' or 'Missing'. COI shows 'Expires Mar 2027', in amber within 30 days of expiry and red once expired. The directory's Docs column shows only problems ('COI expired', 'No W-9') and stays blank when everything is fine. Upload files privately through Attachments instead of linking Drive; contractors upload through the portal later.
- **Desktop, tablet, phone:** Desktop and tablet: a column showing problems only. Phone: the problem text on the row's second line (no corner dots, since a corner dot means unread).
- **Reuse:** Attachments with a contact kind (private blob); Badge amber and red tones; ADMIN-022's status mapping.
- **References:** 
  - [Gusto](https://mobbin.com/screens/349671a4-82a6-4dfe-9019-67d4686a0b04): Documents table: Status column with a dot, a word and a date ('Uploaded Dec 16, 2025', 'Signed Nov 10, 2025')
  - [Mercury](https://mobbin.com/screens/ee13c597-f333-4830-8faa-7265e283e2b1): Recipient drawer has a 'Tax documents (W-9 or W-8BEN)' block with drop zone and 'Request tax documents'
  - [Airwallex](https://mobbin.com/screens/50a0387a-c2e9-4c4c-9a5d-6e405cfb7b5f): Vendor panel with General, Documents and Bills tabs and an Active status
  - [Tailscale](https://mobbin.com/screens/4e66d14e-4efe-4085-b46f-7d044de3bab1): Sections with an Add action and a quiet empty state
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): "Expires Mar 2025" shown inline on the payment method row
  - [Brex](https://mobbin.com/screens/e955e51e-add3-41f4-8c12-a1e58cacee3f): A required document that's absent shows a red 'Missing' tag plus one line on why it matters ('Your policy requires a receipt.'), which is distinct from not applicable.
  - [Brex](https://mobbin.com/screens/47dfde64-0ad0-41c6-978c-c56480db69de): The filter chip is named for the problem ('Missing documentation'), and the row ends in its verb ('Add'). This maps to contractors missing a W-9 or COI.
  - [Shopify](https://mobbin.com/screens/2f6123d0-2fb0-4e5f-87c3-9a3ce0432c24): Vendors table states 'Missing receiving method' per row
  - [Airwallex](https://mobbin.com/screens/286065f4-2153-4d1c-a662-adaa1f567f12): 'Payment info: Missing' with a warning mark
  - [Gusto](https://mobbin.com/screens/2a4319d4-c9f9-40df-84ee-3a9023c180bd): Each person's documents with a status and date.
  - [Gusto](https://mobbin.com/screens/d9e01af7-0bdc-4ccc-bd76-28733ba35371): Required forms as rows, each with its own action button.
- **Code:** `src/app/(app)/contractors/page.tsx:54-59`, `branch: docs/asana-migration-plan.md:494`, `branch:src/app/(app)/contractors/page.tsx:54-59`, `branch:src/app/(app)/contractors/[id]/page.tsx:76-93`, `src/app/(app)/contractors/[id]/page.tsx:85-93,103-120`, `branch src/app/(app)/contractors/page.tsx:38, 54-59`, `src/app/(app)/contractors/[id]/page.tsx:54; src/app/(app)/contractors/page.tsx:55-58`, `Local DB: Contact rows 29, w9Url 3, coiUrl 3`, `4652abb:src/app/(app)/contractors/[id]/page.tsx:76-100`, `4652abb:prisma/schema.prisma:187-201`, `psql: Contact 31, w9Url 3, coiUrl 3, 'W-9 on file' 12`
- **Also found as:** DATA-055 (Lens: tables, numbers, money, charts and status), COPY-038 (Lens: words on every screen), G1D-I15 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** confirmed. 5 of 29 contractors have Drive links for W-9 or COI, with no expiry. The plan schedules 'W-9 and COI tracking through the portal' in weeks 3 to 5, so this fits it rather than conflicting.

### ADMIN-034

**Pick appliance types from a menu, not a text field with hidden rules**

Medium · Design change · effort S · `/settings (CapEx rules)` · Create where you are

- **Migration branch:** Still applies on the migration branch. Appliance names on /settings are still editable text fields. 'Ovenx' snaps back to 'Oven' with no message. '+ Add appliance' and '+ Add system' still persist a row the moment they are clicked.
- **Today:** An appliance's name is an editable text field that only accepts unused types from a list you can't see ('Ovenx' silently reverts). '+ Add appliance' inserts the first unused type with zeros at the top, and '+ Add Roof'-style links only appear when a core type is missing.
- **Why:** An input that only accepts values from a hidden list is a guessing game. Attio and Quicken use menus for a fixed vocabulary.
- **Change:** Show names as plain text. '+ Add appliance' opens a menu of the remaining types, and picking one adds a draft row (see ADMIN-002). Changing a type moves into the row menu as 'Change type'.
- **Desktop, tablet, phone:** Desktop and tablet: a popover menu. Phone: the menu opens as a sheet.
- **Reuse:** React Aria menu (D9); EQUIPMENT_TYPES in src/lib/config.
- **References:** 
  - [Attio](https://mobbin.com/screens/7e06184f-dc8d-4563-b08a-928946be0037): Searchable option menu for a fixed-vocabulary field
  - [Quicken](https://mobbin.com/screens/4190c0c0-1b9b-4848-b2d3-f0be591be0dd): Rules settings with a + Rule button and a ... menu per row
- **Code:** `Probe: 'Ovenx' typed into the Oven cell, Tab, value back to 'Oven'`, `src/app/(app)/settings/capex-rules-editor.tsx:133-181`, `src/app/(app)/settings/capex-rules-editor.tsx:254-267`, `src/app/(app)/settings/capex-rules-editor.tsx:352-356`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:133-181`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:254-267`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:352-356`, `branch:src/components/menu.tsx`
- **Verification:** confirmed. ComboField only accepts unused types that aren't shown anywhere. This replaces the type half of ADMIN-008, so implement one of the two for types, not both.

### ADMIN-035

**CapEx cells can keep showing old numbers after a reset or a rejected save**

Medium · Fix · effort S · `/settings (CapEx rules)` · Fix wrong numbers and records first

- **Migration branch:** Still applies on the migration branch. /settings on :3300 shows the same CapEx editor. capex-rules-editor.tsx is byte-identical to main: InlineNumber and ComboField still copy their value into local state once (101-121, 153-171), saves still revert from the server echo (209-223), and rows are still keyed by type (294-297). Writes are blocked, so I couldn't trigger it live.
- **Today:** From reading the code: InlineNumber and ComboField copy their value into local state once and never resync, and rows are keyed by type. After 'Reset to defaults', or when the server rejects a save (for example with 'Cannot remove or rename a type that units still use'), the rules state reverts but the cells keep the typed text. I couldn't reproduce this here because writes are blocked.
- **Why:** A money figure on screen that doesn't match what's saved is the kind of quiet error that erodes trust in the forecast.
- **Change:** Derive the display text from the value whenever the cell isn't focused (or key cells on their value), so they resync after reset, revert and server echo.
- **Desktop, tablet, phone:** No layout change.
- **Reuse:** InlineAddressField generalized (Duplicates), which already handles commit and revert.
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:101-121`, `src/app/(app)/settings/capex-rules-editor.tsx:153-171`, `src/app/(app)/settings/capex-rules-editor.tsx:209-223`, `src/app/(app)/settings/capex-rules-editor.tsx:294-297`, `branch src/app/(app)/settings/capex-rules-editor.tsx:101-121, 153-171, 209-223, 294-297 (identical to main)`
- **Verification:** confirmed. Reproduced by holding the save request open (a patched fetch, so nothing was written). Refrigerator cost 1200, then Reset to defaults: the cell still read '$1,200' while its value was 1000, which shows on focus. The 'New system' row did disappear.

### ADMIN-036

**Replace the hover-only trash on CapEx rows with a row menu**

Medium · Design change · effort S · `/settings (CapEx rules)` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. /settings still tracks the hovered row in state (capex-rules-editor.tsx:52-87, useState at :64) and shows the red trash only for that row. At 320 and 375 the rule rows overflow the card sideways (the Replace column is cut at 'RE'), so the trash sits off-screen and touch only reveals it after focusing a field.
- **Today:** The red trash only appears while the pointer is over a row (tracked with mouse events). On touch it appears only after tapping into a field, and on phones it lands off-screen.
- **Why:** Touch rule: no hover-only cues. Quicken and Melio put row actions in a ... menu that works with touch and keyboard.
- **Change:** Put a ... button at the end of each row, always visible on touch and shown on hover and focus on desktop, with 'Change type' and 'Delete rule'. On phone, the rule sheet's Delete covers it.
- **Desktop, tablet, phone:** Desktop: the button shows on hover and focus. Tablet: always visible. Phone: Delete inside the sheet (ADMIN-013).
- **Reuse:** React Aria menu (D9); Button ghost variant.
- **References:** 
  - [Jobber](https://mobbin.com/screens/25e7b2d7-dde0-4e48-9bb9-559ee34200c3): Row '...' menu: neutral 'Resend Invitation' first, red 'Deactivate' last
  - [Linear Mobile](https://mobbin.com/screens/5911d6e4-808e-40e9-8fbb-300e7c9c4e9e): Record menu grouped by dividers, with the red destructive item alone at the bottom; works on touch with no hover
  - [Quicken](https://mobbin.com/screens/4190c0c0-1b9b-4848-b2d3-f0be591be0dd): A ... menu at the end of each rule row
  - [Melio](https://mobbin.com/screens/010d2893-f2c1-4bdf-a432-2601d0828490): More menu with Edit vendor and Delete vendor in red
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:55-87`, `branch src/app/(app)/settings/capex-rules-editor.tsx:52-87`
- **Verification:** confirmed. Worse than reported: the trash only renders on mouseenter, so keyboard users can never delete a rule. On a 375 phone, after a tap it renders at x=463. The recommendation's 'show on focus' covers both. The Quicken and Melio references fit.

### ADMIN-045

**Explain Monitor and Replace where they're set**

Medium · Design change · effort S · `/settings (CapEx rules)` · Plain, consistent words

- **Migration branch:** Still applies on the migration branch. /settings column headers 'MONITOR', 'REPLACE' and 'COST' are still 10px uppercase with no explanation (capex-rules-editor.tsx:185). property-types.ts is unchanged.
- **Today:** The column headers 'MONITOR', 'REPLACE' and 'COST' are 10px with no explanation. Property pages show the result as Good, Monitor or Replace chips.
- **Why:** Linear gives every setting a one-line description. Without one, a new person can't tell what 9 yrs and 13 yrs will do.
- **Change:** Add header tooltips with a tap path: Monitor 'Age when it turns amber on property pages', Replace 'Age when it's due and enters the forecast', Cost 'Default replacement cost'.
- **Desktop, tablet, phone:** Desktop: hover and focus. Tablet and phone: tap the header, or read the hint under each field in the sheet.
- **Reuse:** Tooltip (needs the tap path from Known gaps); lifecycleStatus in src/lib/property-types.ts.
- **References:** 
  - [Linear](https://mobbin.com/screens/f3134ca3-b7e5-47ab-a283-92ce2db403db): Each setting carries a one-line muted description
  - [Linear](https://mobbin.com/screens/d4e47b31-9152-40c7-a400-c6725e8de647): Every settings row has a title plus a one-line description of its effect. Monitor and Replace need the same: 'Start flagging at' and 'Plan to replace at'.
  - [Monzo](https://mobbin.com/screens/86f5bf74-4873-44d9-8981-947cf7d766de): A sublabel under the control says what it does in plain words ('Gives you a short period of time to undo...'). It works on touch, with no tooltip.
  - [Stripe](https://mobbin.com/screens/fc7b35c9-f823-4f28-bb16-d981a05cb530): Each setting has a plain label plus a one-line helper
- **Code:** `src/lib/property-types.ts:250-259`, `branch src/app/(app)/settings/capex-rules-editor.tsx:185`, `branch src/lib/property-types.ts:250-259`
- **Also found as:** COPY-049 (Lens: words on every screen)
- **Verification:** confirmed. The headers carry no explanation. Tooltips need the tap path listed in Known gaps.

### ADMIN-IV01

**Decide where contractor job history goes before the Oct 27 delete removes it**

Medium · Design change · effort M · `Contractor record (/contractors/[id]), Jobs card` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** On the branch, the record lists only tasks whose assigneeContactId is this contact, not name matches. The 1,825 done CSV tasks still exist ('Showing first 400 of 1825' under All, Done), but they carry only a legacy assigneeName, so no contractor record shows any history even before D25 runs. Zack shows 8 open jobs and no done rows, Idrius 2, Jacob 6 and Jose 4, and Brandon shows 'No jobs assigned yet.' The 60-row cap no longer matters in practice.
- **Why:** Between jobs, people open a contractor's record mainly to see their past work: who did the porch at 765 Prospect and when, whether to call them back for warranty work, whether to hire them again. Stripe, Square and Shopify keep history on the vendor or customer record. After cutover the record will read as if long-time trades never worked for HG, and the D10 property hub's Activity tab loses the same history.
- **Change:** Connor still picks before the D25 run (plan line 86, Tue Oct 27). Option A (recommended): backfill assigneeContactId on done CSV rows whose name or email matches a Contact, using the same match the All filter needs (TASKS-I18). Exclude those rows from D25, and show them under open jobs as one collapsed row, 'Before Nov 2026 · N jobs'. Option B: delete as planned, and replace 'No jobs assigned yet.' with 'Jobs before Nov 1 are in the Asana archive', linking to the archive. Either way, drop ADMIN-007 and ADMIN-019.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one collapsed row at the foot of the Jobs card. Expanded, it uses the same one-line job row as open jobs. Phone 375: the same collapsed row, full width. Expanded rows show the title and date on line one and the property on line two. Nothing wraps at 320.
- **Reuse:** The Jobs card list and ADMIN-019's Open and Done grouping. Option A keeps existing Task rows behind a flag (or in a small archive table), with no new component. Option B is one line of text plus a link in the existing empty state.
- **Challenges:** D25 (the ~1,900 completed tasks are deleted for good after a backup). Option A keeps a file-less slim copy of them, and option B keeps D25 as is.
- **References:** 
  - [Square](https://mobbin.com/screens/d366bfcd-19ee-478c-a7f8-fa90c26fd7c1): The vendor record keeps a Payment history tab beside Details, so past work lives on the vendor
  - [Shopify](https://mobbin.com/screens/9f3014fa-f713-4fa5-b224-1568668c36e7): The Bill Pay vendor page shows recent bills with a 'View all bills' link instead of the full history inline
  - [Wix](https://mobbin.com/screens/16687e63-6bdb-44f5-ac82-a58f7133b43f): Billing history ends with one line pointing to where older charges can be found, the pattern for option B
- **Code:** `verify-ADMIN/all-records.json`, `src/app/(app)/contractors/[id]/page.tsx:23-28,89-90`, `branch: docs/asana-migration-plan.md:85-86,345,475`, `branch src/app/(app)/contractors/[id]/page.tsx:42-49`, `eval on :3300: Zack 8 jobs / 0 struck; Idrius 2/0; Jacob 6/0; Jose 4/0; Brandon 0 with 'No jobs assigned yet.'`, `eval on :3300 /tasks/all?status=done: 'Showing first 400 of 1825'`, `branch: docs/asana-migration-plan.md:86,349,479`
- **Verification:** verifier-found

### ADMIN-V01

**Settings tabs don't expose which page is open, and they wrap at 320**

Medium · Fix · effort S · `/settings, /settings/move-in-form, /settings/storage (TopTabs, also used on /financials)` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. TopTabs is unchanged (nav.tsx:126-150): it has no aria-current, no nav landmark, and the active state is a computed class. On the branch it also renders Today | All on /tasks and /tasks/all (tasks-header.tsx:17-23). The ARIA snapshot of /tasks/all shows plain 'link "Today"' and 'link "All"' with no current state. At 320 the settings tabs still break inside their labels ('CapEx / rules', 'Move-in / form') and grow to 58px tall.
- **Today:** Blue text and an underline are the only marks on the active tab. The links have no aria-current or selected state, so the accessibility tree shows the same 'link "CapEx rules"', 'link "Move-in form"', 'link "Storage"' on every tab, and the row isn't a nav landmark. At 320 the labels break inside themselves ('CapEx / rules', 'Move-in / form').
- **Why:** The house rule says state shows through color and is exposed through an attribute. A screen reader can't tell which settings page is open. A tab row that breaks onto two lines also breaks the 'rows of controls never wrap' rule.
- **Change:** Set aria-current="page" on the active link and wrap the row in <nav aria-label="Settings sections">. Style the active state from [aria-current=page] instead of a computed class. Add whitespace-nowrap to the labels, and shorten them where needed so the row fits at 320.
- **Desktop, tablet, phone:** Same at 1280, 768 and 375. At 320 every label stays on one line; shorten to 'CapEx', 'Move-in' and 'Files' if they don't fit. If ADMIN-009 removes the Settings tabs, the fix still applies to Financials.
- **Reuse:** TopTabs in src/components/nav.tsx.
- **Challenges:** Typography rule says to expose tab-row state with role="tab" and aria-selected. These tabs are route links, and for route links aria-current="page" is the correct ARIA pattern (role=tab belongs to in-page tab panels), so this recommends aria-current for TopTabs.
- **Code:** `src/components/nav.tsx:126-150`, `branch src/components/nav.tsx:126-150`, `branch src/app/(app)/tasks/tasks-header.tsx:17-23`
- **Verification:** verifier-found

### ADMIN-031

**Show what we've paid each contractor, from the QuickBooks mirror**

Low · New capability · effort M · `/contractors/[id]` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. /contractors/[id] has no payments block. QboVendor.contactId exists on the branch as before, and nothing on the record reads it.
- **Today:** QboVendor.contactId and vendorQboId exist and vendors are unsurfaced, but there is no production QuickBooks data yet and vendor matching is best-effort, so the block would show nothing today.
- **Why:** Ramp and Stripe put spend on the counterparty's page. 'How much have we paid Zack this year?' is a natural question asked right here.
- **Change:** Add a read-only Insights block at the top of the rail with 'Paid this year' and 'Last payment' figures and the SourceBadge freshness line, linking to Financials filtered to that vendor. Show nothing when the contractor has no linked QuickBooks vendor.
- **Desktop, tablet, phone:** Desktop: the top of the rail. Tablet: the first item in the details grid. Phone: one line under the header buttons.
- **Reuse:** Kpi, fmtCents and SourceBadge from financials/_components (move them to components/ first, per the inventory); QboVendor.contactId; the vendorQboId field on synced QuickBooks lines.
- **References:** 
  - [Mercury](https://mobbin.com/screens/ee13c597-f333-4830-8faa-7265e283e2b1): 'Total paid' per recipient in the list, and 'No payment history' as a plain statement in the drawer
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): 'Insights: Spent' at the top of the customer rail
  - [Shopify](https://mobbin.com/screens/5070a71f-df97-4c8a-b3cf-2c1eeb0d931e): Unpaid, Scheduled and Paid totals above a vendor's bills
  - [Mercury](https://mobbin.com/screens/ee50b360-f122-40cf-8e96-61567d032bc0): Transactions grouped by payee: each group header shows the transaction count and a total, with dated rows below.
  - [Gusto](https://mobbin.com/flows/f0f7a9f4-7bbb-45fb-acbf-f25c1fd0e5b1): Pay leads to a Pay history with a tab for contractors, so past payments to each person are one click from the payment action.
- **Code:** `prisma/schema.prisma:557-571`, `prisma/schema.prisma:613`, `src/lib/quickbooks/sync.ts:175`, `branch:prisma/schema.prisma:910-926`, `branch:src/app/(app)/contractors/[id]/page.tsx:29-165`, `src/app/(app)/contractors/[id]/page.tsx:52`, `src/lib/quickbooks/sync.ts:200`, `branch-src/src/lib/quickbooks/sync.ts:284`, `hg_capital_review DB: LedgerLine 210 rows, 0 with vendorQboId; QboVendor 26 rows, 0 with contactId`
- **Also found as:** JOURNEYS-I10 (Lens: the core jobs, end to end)
- **Verification:** partly. Schema and sync code match the claim. But the local QuickBooks connection is the sandbox ('Environment sandbox' on /financials/settings), production connect hasn't happened yet, and vendor-to-contact matching is best-effort. The block would be empty in production today. Worth doing after production connect.

### ADMIN-033

**Move 'Reset to defaults' out of the page's primary action slot**

Low · Design change · effort S · `/settings (CapEx rules)` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. 'Reset to defaults' is still the only button in the /settings page header, in the primary action slot, at every width.
- **Today:** Accurate, but a confirm dialog already guards the action, so this is low-severity polish.
- **Why:** Linear and Vercel keep destructive actions in a separate section at the bottom of the page so nobody hits them by habit.
- **Change:** Move it to a 'Reset' row at the bottom of the page reading 'Replace every rule with the built-in defaults', with a danger button. Keep the confirm dialog.
- **Desktop, tablet, phone:** Desktop and tablet: the last row on the page. Phone: the last row of the list.
- **Reuse:** Button danger variant; ConfirmDialog.
- **References:** 
  - [Linear](https://mobbin.com/screens/7404a1f7-c117-4c66-93f3-10fbe7460be6): Danger zone section at the bottom of workspace settings
  - [Vercel](https://mobbin.com/screens/bd86d676-09f5-45da-87e1-4d07eac54875): Destructive Actions grouped at the end of the page
- **Code:** `src/app/(app)/settings/capex-rules-editor.tsx:301-309`, `branch:src/app/(app)/settings/capex-rules-editor.tsx:301-309`
- **Verification:** partly. It is the only page action, top right. A confirm dialog already guards it, so moving it is polish. The Linear and Vercel danger-zone references fit.

### ADMIN-037

**Show how many units use each CapEx rule**

Low · New capability · effort S · `/settings (CapEx rules)` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. /settings CapEx rows still show only name, ages and cost, with no usage count. The server-side in-use block in settings/actions.ts:133-149 is unchanged.
- **Today:** Accurate; the server already blocks an in-use delete with a plain message, so the count is a low-severity improvement.
- **Why:** Greptile's rules table shows usage per rule. It tells you what a change will touch before you make it, which is closing the loop.
- **Change:** Add a muted count after the name ('Refrigerator · N in use'). Disable Delete with a tooltip when the rule is in use ('Used on N units. Change those first.').
- **Desktop, tablet, phone:** Desktop and tablet: the count after the name. Phone: the count on the row's second line, and the tooltip text inside the sheet.
- **Reuse:** orphanedEquipmentTypes in src/lib/property-types.ts already counts uses per type and property; Tooltip (needs a tap path, Known gaps).
- **References:** 
  - [Greptile](https://mobbin.com/screens/0699282d-5c78-4f70-bc11-c722d1ce254a): Rules table with a Usage column per rule
- **Code:** `src/app/(app)/settings/actions.ts:133-149`, `branch src/app/(app)/settings/actions.ts:133-149 (identical to main)`
- **Verification:** partly. Code confirms the server-only rejection with a clear message. The usage count is useful context but not friction you hit often, so low. The Greptile reference fits.

### ADMIN-039

**'+ Add item' adds a blank row out of view and leaves focus on the button**

Low · Fix · effort S · `/settings/move-in-form` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. On /settings/move-in-form at :3300, after clicking '+ Add item' document.activeElement is still the BUTTON '+ Add item'. The new blank row lands at the end of the section without focus or scroll.
- **Today:** Accurate; low-severity friction.
- **Why:** Survey builders focus the new field so you can type straight away.
- **Change:** Focus the new field and scroll it into view. Enter in an item adds the next one; Backspace in an empty item removes it.
- **Desktop, tablet, phone:** Same everywhere; on phone the field scrolls above the keyboard.
- **Reuse:** An input ref inside SectionEditor.
- **References:** 
  - [Zoom](https://mobbin.com/screens/4f85b30b-2791-40d4-adf3-1e49324a64f9): Add choice adds an editable field inline under the last one
- **Code:** `Probe: activeElement after '+ Add item' is the BUTTON`, `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:41-49`, `Probe on :3300 /settings/move-in-form: activeElement after '+ Add item' = 'BUTTON + Add item'`, `branch src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:41-49`
- **Verification:** partly. Reproduced: after '+ Add item', activeElement is the BUTTON, and the new row is at the bottom of Kitchen (verify-ADMIN/movein--added--desktop-light.png). This is small friction.

### ADMIN-040

**Let move-in items be reordered**

Low · New capability · effort M · `/settings/move-in-form` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. /settings/move-in-form items still can't be reordered. Each row is a text field plus a trash button (move-in-form-editor.tsx:82-101).
- **Today:** Accurate; a low-priority capability for a rarely edited form.
- **Why:** Order is part of the form's design (a walkthrough goes floor, walls, fixtures). Survey builders and iOS edit modes all let you reorder.
- **Change:** Desktop: drag handles, plus Move up and Move down in the row menu for keyboard users. Phone: an iOS-style section edit mode with grab handles and Done.
- **Desktop, tablet, phone:** Desktop and tablet: drag handles that show in the section's edit mode. Phone: edit mode with handles and red remove buttons.
- **Reuse:** React Aria GridList drag and drop (same library as D9); the SectionCard edit mode.
- **References:** 
  - [Jobber](https://mobbin.com/screens/1a8d1047-7cd6-48d8-99ea-ee24ef276af6): Template line items carry a small drag handle at the left edge, the only reorder affordance
  - [Evernote](https://mobbin.com/screens/efe4453d-c71c-4547-a9a9-4a46b2dedc0b): Edit list with remove buttons, grab handles, Cancel and Done
  - [Maze](https://mobbin.com/screens/43596365-445e-4231-b020-fce1d1e201b7): Reorderable block list in a builder
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:82-101`, `branch src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:82-101`
- **Verification:** partly. Items can't be reordered and new ones always land last. The form is edited rarely. This overlaps ADMIN-041's edit mode, so build them together.

### ADMIN-041

**46 permanent trash icons clutter the move-in form**

Low · Design change · effort S · `/settings/move-in-form` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. /settings/move-in-form still shows a permanent trash icon on every item. The probe counts 46 'Remove …' buttons, each 14x14 at 375.
- **Today:** Accurate; polish, and best solved together with ADMIN-040 and ADMIN-014.
- **Why:** Repeating a destructive control on every row is visual noise, and at 14px it's well under a usable tap size. The touch rule says not to fix hover cues by making them permanent; tap-to-edit is the alternative.
- **Change:** In view mode items read as plain rows. Each section header gets an 'Edit' that reveals remove and reorder controls for that section, with Done to leave.
- **Desktop, tablet, phone:** Desktop, tablet and phone: per-section Edit mode; on phone, remove shows as a leading red minus as in iOS edit lists.
- **Reuse:** SectionCard's existing onEdit and editing props.
- **References:** 
  - [Jobber](https://mobbin.com/screens/25e7b2d7-dde0-4e48-9bb9-559ee34200c3): One quiet '...' per row holds the destructive action instead of a visible delete icon on every line
  - [SiriusXM](https://mobbin.com/screens/cfb1e560-c6ae-4883-b6b9-47eff0ade897): Separate Edit screen with delete and drag on each row, Cancel and Save
  - [Garmin Connect](https://mobbin.com/screens/6fa3a735-309f-4022-a1d1-5ff182b29a2f): iOS edit mode with leading remove buttons and grab handles
  - [Linear](https://mobbin.com/screens/f00cc4fb-4083-43fc-a0fb-703a6c4ef771): Sub-issue rows carry no per-row delete icon; destructive actions live in the row menu.
  - [Linear Mobile](https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690): Menu lists neutral actions first and 'Delete project' last in red.
  - [Stripe](https://mobbin.com/screens/339c37f1-1eb6-41a0-9c7a-ec87749d089d): Row actions behind a trailing menu.
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:91-99`, `Probe on :3300: 46 main button[aria-label^=Remove]; 'Remove Cabinets' 14x14 at 375`, `branch src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:91-99`
- **Also found as:** VISUAL-060 (Lens: visual design system across every screen)
- **Verification:** partly. There are 46 trash buttons at 14x14px. This is visual polish, and it overlaps ADMIN-040 (edit mode) and ADMIN-014 (editor redesign). The SiriusXM and Garmin references fit for iOS edit mode.

### ADMIN-043

**Storage can't tell you whether the move to private storage is done**

Low · Fix · effort S · `/settings/storage` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /settings/storage still shows totals only ('0 property documents · 12 task attachments'), with no public count and no record of the last run. There's a new wrinkle on the branch. Tasks can now hold LINK attachments with no bytes; the migration skips them (migrate.ts:50-55), but attachmentCounts() still counts every TaskAttachment row (migrate.ts:79-82). So the 'task attachments' total includes links.
- **Today:** The page shows totals only and the run result is lost on reload; the public-file count is already proposed in ADMIN-042.
- **Why:** Close the loop: the page should say whether there's work to do and what the last run did.
- **Change:** Count rows whose URL is still public and show that count beside the action; hide the action at 0. Keep the last run's result ('Moved 40, 2 failed: lease.pdf, w9.pdf') with its date.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** attachmentCounts and MigrationReport in src/lib/attachments/migrate.ts.
- **References:** 
  - [Supabase](https://mobbin.com/screens/8fbf5195-cad2-4e3c-8af4-1ef371e4e9b7): Facts grid of uppercase label plus a plain statement ('LAST BACKUP No backups', 'LAST MIGRATION No migrations')
  - [GitLab](https://mobbin.com/screens/b243d839-d464-4d13-8af1-27e93eaa70e1): Usage breakdown by type with a Recalculate action
- **Code:** `src/lib/attachments/migrate.ts:76-79`, `src/app/(app)/settings/storage/migrate-button.tsx:29-38`, `branch src/lib/attachments/migrate.ts:50-55, 79-82`, `branch src/app/(app)/settings/storage/migrate-button.tsx:29-38`
- **Verification:** partly. This largely repeats ADMIN-042, whose recommendation already shows 'N older files are still public' and hides the action at 0. The only new part is keeping the last run's result. It's a one-off migration, so low.

### ADMIN-048

**A contractor with no jobs gets a big empty card and no next step**

Low · Design change · effort S · `/contractors/[id]` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Copy improved, but the layout and missing next step remain.
- **Today:** /contractors/cmtg25y9z000gjphs9ar7tuqz (Steve Fuller): the empty Jobs card now reads 'No jobs assigned yet.' (contractors/[id]/page.tsx:130), and jobs now come from real assignment. The card still stretches to the full grid row, and the left column on the branch is taller because the Portal access card sits under Contact (page.tsx:62-121), so it's roughly 700px of empty card. There's still no way to assign a job from here.
- **Why:** Copy rule: use the lightest form. An empty section should be one line plus the next action.
- **Change:** Keep the new copy (or 'No jobs for Steve yet'). Add an 'Assign a job' link to /tasks/new with this contractor preset; New task accepts only propertyId and dealId today (tasks/new/page.tsx:12), so extend it with a contactId preset for the assignee picker. Let the Jobs card size to its content (self-start) when it's empty.
- **Desktop, tablet, phone:** Same at every size.
- **Reuse:** The EmptyState rule in docs/components.md (a muted one-line message inside a card); the task creation flow.
- **References:** 
  - [Stripe](https://mobbin.com/screens/731c4495-3c95-42b2-9502-5a1b60ab96eb): Compact empty sections on a customer page with one action
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:89-91`, `branch src/app/(app)/contractors/[id]/page.tsx:62-130`, `branch src/app/(app)/tasks/new/page.tsx:12`
- **Verification:** confirmed. Steve Fuller's Jobs card is 536px tall for one line, because it stretches with the grid. I didn't check whether task creation accepts a preset assignee.

### ADMIN-050

**Give Files a storage summary before contractor videos arrive**

Low · New capability · effort M · `/settings/storage` · A quiet shell with real search, navigation and sign-in

- **Migration branch:** Still applies on the migration branch. /settings/storage still shows row counts only. The branch now ships the contractor photo and video uploads this finding anticipated: task videos up to 500 MB, images up to 25 MB and files up to 50 MB (content-types.ts:25-27). TaskAttachment already stores size and kind (schema.prisma:342-348).
- **Today:** Storage shows counts only, but storage size is already visible in Vercel; the in-app benefit is small.
- **Why:** Storage housekeeping is this page's job, and a breakdown by kind is how GitLab and Zoho let you spot what's taking space.
- **Change:** Show one total ('2.4 GB used') with a breakdown by kind (property documents, task photos and videos, listing photos) and a link to the 10 largest files.
- **Desktop, tablet, phone:** Desktop and tablet: a small table. Phone: three rows with values.
- **Reuse:** formatBytes in src/lib/utils.ts; Table.
- **References:** 
  - [Supabase](https://mobbin.com/screens/85ee2458-092c-4d14-8007-1dcdabc74c03): Usage summary: explanation on the left, a grid of quotas as 'used / limit (percent)' on the right
  - [Supabase](https://mobbin.com/screens/1b5c5833-47a8-42d2-ba47-1d13d36577e6): Storage size section with included amount, current use and a per-day bar chart
  - [GitLab](https://mobbin.com/screens/b243d839-d464-4d13-8af1-27e93eaa70e1): Total usage with a per-type breakdown table
  - [Zoho CRM](https://mobbin.com/screens/5706d4fa-ece6-44a8-bb32-0a118006ccec): Usage details with record count and size per module
- **Code:** `src/lib/attachments/migrate.ts:76-79`, `branch: docs/asana-migration-plan.md:28`, `branch src/lib/attachments/content-types.ts:25-27`, `branch prisma/schema.prisma:342-348`, `branch src/lib/attachments/migrate.ts:79-82`
- **Verification:** partly. The value is marginal: Vercel's dashboard already shows Blob usage. Only a '10 largest files' list is specific to this app. Locally the counts are 0 and 0.

### ADMIN-I01

**Label contractor notes as team-only before contractors can sign in**

Low · Design change · effort M · `Contractor record (/contractors/[id])` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The comment is still an unlabeled gray paragraph at the foot of the Contact card. On Zack it reads 'W-9 on file: Scanned Jul 24, 2025 at 7:48:30 AM - Zachary Reading.pdf'. The branch builds contractor logins (Portal access card), and the plan turns the portal flag on Thu Oct 29, so the 'before contractors sign in' deadline is a week away. The portal pages don't read Contact.comments.
- **Today:** The note is an unlabeled gray paragraph at the foot of the Contact card. Across all 29 records, 12 notes are 'W-9 on file' import residue, 3 are real notes, and 13 contractors have none. No planned portal screen shows contact notes.
- **Why:** Once outside people sign in, a note with no visibility label is ambiguous. Partners either hold back or assume it's private when a later portal profile might show it. Jobber labels its notes card 'Internal notes will only be seen by your team' and gives each note an author and date, which turns notes into a record.
- **Change:** Move comments into an 'Internal notes' card in the record's rail, with the sublabel 'Only you and Pieter see these.' Each note shows the author's initials, the date and the text. A one-line composer adds a note, and Cmd-Enter saves. Import today's comments field as the first note, dated from the import.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a card in the right rail below Documents. Phone 375: its own section after jobs, or the Notes segment if ADMIN-I18 lands, with the composer full width. Nothing drops.
- **Reuse:** Card, CardHeader, CardTitle and Textarea from src/components/ui.tsx. Use the same composer and INTERNAL visibility as the planned task timeline (TaskEvent), on a new ContactNote table.
- **References:** 
  - [Jobber](https://mobbin.com/screens/abeeeed7-cf13-4196-b7cb-6c97a3f5d90f): Internal notes card in the client rail with the team-only sublabel, and each note shown with author, date and attachment
  - [Jobber](https://mobbin.com/screens/9e1d48e7-f1cc-4042-ab2c-e3fafde3d160): Focused note composer with attach and Cancel/Save, inline in the rail
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:73-77`, `branch src/app/(app)/contractors/[id]/page.tsx:95-99`
- **Verification:** partly. Seen: the comments field is an unlabeled 12px gray paragraph under a divider (verify-ADMIN/zack--desktop-light.png, page.tsx:73-77). The fix is overbuilt. Only 16 of 29 contractors have a note. 12 of those are 'W-9 on file: ...' import residue that ADMIN-022 already moves into the W-9 status. The rest are 'Smaller scale', 'Larger scale' and Steve Fuller's after-hours number (ADMIN-004). A ContactNote table with author, date and a Cmd-Enter composer is a notes product built for about three notes. It also overlaps IA-034, which already puts one activity timeline with an 'Add note' composer on the contractor record. The visibility worry is speculative: the approved portal has no contractor profile page, only My jobs and job pages. A lighter version fits: a 'Notes' card in the rail (ADMIN-021) with the sublabel 'Only you and Pieter see this', edited in place. Shopify's customer Notes card does exactly this ('Notes are private and won't be shared with the customer', https://mobbin.com/screens/701a72d1-69a7-42dd-a2df-827345501ef8). Mobbin carries Jobber, so the cited Jobber screens are plausible, but the search didn't return those two ids.

### ADMIN-I03

**Say what happens next before creating a contractor's login**

Low · Design change · effort S · `Contractor record, planned Portal access card` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The Portal access card is built. With no login yet, it shows the 'Portal access' title, an Email field prefilled with [email] and a 'Create login' button, and says nothing about what Zack will see. After creating, it shows the starting password with Copy and 'Text login details', then 'Shown once. Zack picks their own at first sign-in.' With a login, it shows Email, Last signed in, Reset password, Sign out everywhere and Remove access.
- **Why:** A login gives an outside person lockbox codes (D21) and job notes (D16). Basecamp puts a 'What happens next?' box beside the commit button and names the person on it ('Save changes for Jane'). Gusto's contractor setup ends with 'Here's what happens next'.
- **Change:** Keep the built states. In the no-login state only, add one muted line above the Email field ('Sees only jobs assigned to Zack, with lockbox codes on open ones.') and rename the button 'Create login for Zack'. The post-create 'picks their own' line already covers the password step.
- **Desktop, tablet, phone:** Desktop and tablet: a rail card. Phone: a full-width section with the button full width at its foot. The three lines stay at every size because they're the point.
- **Reuse:** Card and Button from src/components/ui.tsx, inside the planned Portal access card.
- **References:** 
  - [Basecamp](https://mobbin.com/screens/cf079850-f3c0-467d-98e3-8b7b4caf2d8a): 'What happens next?' box explaining the email the person gets, beside a button that names them ('Save changes for Jane')
  - [Gusto](https://mobbin.com/screens/fd254564-eb5b-4b85-9fea-cb7389c82178): Contractor setup review ends with 'Here's what happens next: Gusto will send Sam the contractor agreement'
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:41-118`, `branch: docs/asana-migration-plan.md:189-195`, `branch src/app/(app)/contractors/[id]/portal-access-card.tsx:84-108,246-277`
- **Verification:** partly. Accurate that the Portal access card exists only in the plan (lines 189-195) and that nothing says what a login exposes. The fix is three sentences, but the copy rules allow at most one short line. The middle sentence also depends on the starting-password model, which G1A-001 (invite link instead) may replace. This belongs inside G1A-010's 'No login' state, not a separate card. Suggested single line: 'Zack sees only jobs assigned to him, with lockbox codes on open ones.' The 'Create login for Zack' label is good. Basecamp does support a one-sentence scope line on its outside-person setup screen (https://mobbin.com/screens/04fe127c-12ea-4437-a597-a40aac0c921f) and an 'Invitation emailed to Jane Doe' payoff with the next step (https://mobbin.com/screens/7605dd73-96bb-4f75-8079-be75cf86e10e). I couldn't confirm the exact cited Basecamp id.

### ADMIN-I05

**Archiving a contractor should say what happens to their open jobs and login**

Low · Design change · effort S · `Contractor record, ... menu` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. There is still no Archive and no ... menu on the record. contractors/actions.ts exports only the five portal-login actions. The directory sorts active contractors first and badges the rest 'inactive'. The branch does add 'Remove access' for a portal login, behind a ConfirmDialog.
- **Today:** No Archive control exists. ADMIN-003 and ADMIN-011 already add Archive to the record's ... menu. This finding only specifies the confirmation.
- **Why:** Archiving affects open jobs and portal access, and neither shows on the button. Jobber's Deactivate dialog states the effect in one bullet ('unassign them from all incomplete visits, but maintain a record of all their past activity'), and the red button repeats the verb.
- **Change:** Put Archive last in the record's ... menu, after a divider. The confirm reads: 'Archive Zack Reading? His 4 open jobs go back to unassigned. His portal sign-in ends. His past jobs stay on record.' Buttons: Cancel and 'Archive Zack'. After archiving, show a toast with Undo, and move him to an 'Archived' view in the directory.
- **Desktop, tablet, phone:** Desktop and tablet: a centered dialog. Phone: a bottom sheet with stacked full-width buttons, the destructive one last.
- **Reuse:** ConfirmDialog in src/components/confirm-dialog.tsx, after ADMIN-032 adds Esc and a focus trap. Toast is a known gap in docs/components.md.
- **References:** 
  - [Jobber](https://mobbin.com/screens/7d406b93-e47a-4fb1-a7c2-bc59bc456bb5): 'Deactivate Alex Smith' dialog lists the consequence and uses a red 'Deactivate User' button
  - [Linear Mobile](https://mobbin.com/screens/5911d6e4-808e-40e9-8fbb-300e7c9c4e9e): Record menu ends with the red destructive item after a divider
- **Code:** `src/app/(app)/contractors/page.tsx:19,49`, `prisma/schema.prisma (model Contact, active)`, `branch src/app/(app)/contractors/actions.ts:20-55`, `branch src/app/(app)/contractors/[id]/portal-access-card.tsx:191-215`, `branch src/app/(app)/contractors/page.tsx:20,47`
- **Verification:** partly. Code matches: Contact.active exists, the directory sorts by it and shows an 'inactive' badge (page.tsx:19,49), nothing sets it, and every contact is active. Archive itself is already proposed in ADMIN-003 and ADMIN-011, so this only adds the confirmation wording. The consequences it states ('his 4 open jobs go back to unassigned', 'his portal sign-in ends') are new product rules, not in the plan. D12 covers only reassignment. Treat them as a question for Connor, not fixed copy. Archiving one of 29 contractors is rare, so low. Jobber's archive confirmation states the access consequence in one line ('They will still have access to client hub', https://mobbin.com/screens/f6a40c11-9dc4-42d9-831f-4c1d021a4f98). ConfirmDialog has no Escape handling today (confirm-dialog.tsx has no keydown), as noted.

### ADMIN-I06

**Add 'New job' to the contractor record, with the contractor already filled in**

Low · New capability · effort S · `Contractor record header` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** The record header still has no create action. /tasks/new still reads only propertyId and dealId and defaults the assignee to the signed-in user. The prerequisite has shipped, though: New task uses the single AssigneePicker with a Contractors group, and the free-text field with the 'e.g. Zack Reading' placeholder is gone.
- **Why:** In Jobber, work starts from the person you're looking at. The client page puts 'Create new… Job' in More actions, and the phone record has one full-width Create button.
- **Change:** Add a 'New job' secondary button to the record header linking to /tasks/new?contactId=<id>. In new/page.tsx, read contactId and pass defaultAssignee={{ contactId }}, falling back to the signed-in user. The placeholder part is done.
- **Desktop, tablet, phone:** Desktop and tablet: a header button. Phone: the fourth button in the labeled action row under the name. At 320, if four don't fit, it moves into the ... menu.
- **Reuse:** LinkButton from src/components/ui.tsx, the existing tasks/new page and the planned contractor-aware assignee picker.
- **References:** 
  - [Jobber](https://mobbin.com/screens/64da9002-e9f6-4d48-b021-11fcf6826b33): More actions on a client record starts with 'Create new…' Request, Quote, Job, prefilled for that client
  - [Jobber](https://mobbin.com/screens/7c66f8f1-8ea8-4582-98bf-a0f88dcccf56): iOS client record with one full-width Create button under the name
- **Code:** `src/app/(app)/tasks/new/page.tsx:9,68-69`, `branch src/app/(app)/tasks/new/page.tsx:12,43`, `branch src/app/(app)/tasks/new/new-task-fields.tsx:40`, `branch src/app/(app)/contractors/[id]/page.tsx:52-60`
- **Verification:** partly. Verified: tasks/new reads only propertyId and dealId (page.tsx:9), and the contractor is a free-text 'Or external assignee (contractor name)' field with the placeholder 'e.g. Zack Reading' (page.tsx:68-69). The placeholder is a real contractor's name, which breaks the real-data rule. A fourth header button next to Call, Text and Email (ADMIN-011), with a ... menu beside them, crowds the header and pushes to a fifth control at 320. Most jobs start from a property or task, not from a contractor. Better: a small 'New job' action in the Jobs section header that preselects the contractor. Jobber does this with a 'New' button on the client page's work section (https://mobbin.com/screens/fd47e7a5-dbce-47e9-8529-f5525ae8354c). Severity low.

### ADMIN-I08

**Show where a contractor's updates go and the last one sent**

Low · New capability · effort S · `Contractor record, planned Portal access card` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The Portal access card now exists. With a login it shows Email, Last signed in and the account actions, and nothing about where updates go or what was last sent. The outbox exists (NotificationOutbox with sentAt, counted for the daily cap), but no staff screen reads it.
- **Today:** The contractor page says nothing about email. Under D19, contractors will get an email for every staff change to their job, bundled per 10 minutes through an outbox. No planned screen shows what was sent or whether a send failed.
- **Why:** When Zack says he never got the update, Connor has nothing to check. Jobber's communication settings name the exact address and number messages go to in one sentence, and the client page shows 'Last client communication' with a date, a subject and a View link.
- **Change:** Add two lines to the Portal access card: 'Updates go to [email]' and 'Last sent Oct 22: Cabinet install moved to Fri' with a View link to the sent email. If a send failed, show in red: 'Didn't send Oct 22. Retry'.
- **Desktop, tablet, phone:** Two lines in the rail on desktop and tablet. Phone: the same two lines, with the subject truncated by an ellipsis on one line.
- **Reuse:** The planned NotificationOutbox table and the Card from src/components/ui.tsx.
- **References:** 
  - [Jobber](https://mobbin.com/screens/e8ca14a8-0a0a-4f89-b9b4-c2637a63e1e8): Communication settings open with one sentence naming the phone and email that automated messages go to
  - [Jobber](https://mobbin.com/screens/66b55c90-a7e6-43e6-aab9-a8c03bf5a7fb): 'Last client communication: Sent Jul 25, 2025, Statement from…' with View Communication and View All
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:41-118`, `branch: docs/asana-migration-plan.md:80,140,295-299`, `branch src/app/(app)/contractors/[id]/portal-access-card.tsx:110-122`, `branch src/lib/tasks/queries.ts:125-134`
- **Verification:** partly. Accurate that nothing planned shows sent or failed contractor emails (D19, outbox). Plan default 5 already covers the cap case with a banner on Today. 'Updates go to [email]' repeats the Email field on the same record, which G1A-010 is trying to avoid. Keep only what helps: record each send as an entry in the job's activity ('Emailed Zack · Oct 22'), and show one red line on the card only when a send failed ('Couldn't email Zack on Oct 22 · Retry'). The portal isn't live and email volume is low, so low.

### ADMIN-I09

**Add a 'Needs W-9' view to the directory before 1099 season**

Low · Design change · effort S · `Contractors directory (/contractors)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. The directory is unchanged apart from the count ('31 contractors & service providers', including two local Device Check contacts). The Docs column shows W-9 or COI links and is '—' for most rows. There is no view switch.
- **Today:** 3 contractors have a W-9 link and 12 more say 'W-9 on file' in their notes, so 15 of 29 actually lack a W-9.
- **Why:** 2026 1099-NEC forms are due by Jan 31, 2027, and each one needs a W-9 on file for the contractor. Mercury's Recipients page puts 'All | Has Tax Docs | Needs Tax Docs' directly above the list, so the gap is one click.
- **Change:** Add a view switch above the directory: All | Needs W-9, with a count. 'Needs W-9' lists active contractors with no W-9 on file, sorted by Paid this year (ADMIN-031) once that exists, so the ones who need a 1099 come first.
- **Desktop, tablet, phone:** Desktop and tablet: the segmented control sits left of search on one row. Phone: the control goes full width above the list, or the title becomes the view switcher ('Contractors ▾') if the row is tight at 320.
- **Reuse:** The segmented control in src/app/(app)/deals/filters.tsx, extracted to src/components per the inventory's Duplicates note. ADMIN-029 supplies the document status.
- **References:** 
  - [Mercury](https://mobbin.com/screens/ee13c597-f333-4830-8faa-7265e283e2b1): Recipients list with All, Has Tax Docs and Needs Tax Docs views above the table, and Total paid per row
- **Code:** `inspire-ADMIN/contractor-emails-docs.txt`, `src/app/(app)/contractors/page.tsx:54-59`, `branch src/app/(app)/contractors/page.tsx:24,54-59`
- **Verification:** partly. The links are as stated: W-9 for Kenneth Gonzalez, Kevin Fawcett and Zack Reading, COI for John detzler, Vincent Grant and Zack Reading. But 12 contractors note 'W-9 on file' only in their notes, so 14 have a W-9 and only 15 are truly missing one. A filter on w9Url today would list 26 and be wrong for 11 of them. ADMIN-029 already makes the Docs column show only problems ('No W-9'), and ADMIN-024 and ADMIN-015 add Trade and Portal filters. A separate All | Needs W-9 segmented control on top of those is another switch for a 29-row list. Make 'No W-9' one option in the planned Filters, after ADMIN-022 moves note-based W-9s into the field. The Jan 31 1099-NEC deadline is right, though only contractors paid over the IRS threshold need one. I couldn't confirm the Mercury id: a search for Mercury recipients returned other apps.

### ADMIN-I10

**Request a W-9 or COI from the contractor's record and let them upload it in the portal**

Low · New capability · effort M · `Contractor record, Documents section` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. W-9 and COI are still Drive 'View' links in the Contact card. The branch's portal (/p, /p/jobs/[id]) has no document request or upload for them, and 'W-9' appears only in the two staff contractor pages.
- **Today:** W-9 and COI are Drive links on 3 records each, and 12 notes record a W-9 on file. Portal-based W-9 and COI tracking is already planned for weeks 3 to 5.
- **Why:** Mercury's recipient drawer has 'Request tax documents', then shows 'Pending Requests (1), Expires in 31d, Cancel Request' and a toast naming the recipient. Gusto's contractor invite includes the W-9 as a setup step. Asking through the portal files the document on the record without anyone retyping a link.
- **Change:** Add a 'Request' link next to a missing W-9 or an expiring COI. It puts one item at the top of the contractor's portal ('Upload your W-9') and shows 'Requested Oct 23 · Cancel' on the record until he uploads. The upload files as the W-9 with its date. Toast: 'Asked Zack for his W-9.' Schedule it after the Nov 1 cutover.
- **Desktop, tablet, phone:** Desktop and tablet: a rail row with Request right-aligned. Phone: a row in the Documents section with a 44px tap target. On the portal side it's a single upload screen with the camera option.
- **Reuse:** Attachments in src/components/attachments.tsx (private Blob), a new portal upload kind, and ADMIN-029's document statuses.
- **References:** 
  - [Mercury](https://mobbin.com/screens/0ae73718-a491-400d-96e3-0392f4dd9f37): Pending request card with expiry and Cancel Request, plus a toast naming who was invited to fill in details
  - [Mercury](https://mobbin.com/screens/ee13c597-f333-4830-8faa-7265e283e2b1): Tax documents block in the recipient drawer with a drop zone and 'Request tax documents'
  - [Gusto](https://mobbin.com/screens/514a6ae7-e9b2-4d18-abd0-5ead94eb48d1): 'Invite Sam to Gusto' includes a Documents card: 'Send these documents to Sam… Taxpayer Identification (Form W-9)'
- **Code:** `inspire-ADMIN/contractor-emails-docs.txt`, `src/app/(app)/contractors/[id]/page.tsx:54-71`, `branch src/app/(app)/contractors/[id]/page.tsx:76-94`, `grep 'W-9|w9|COI' in branch src/app and src/lib: only contractors/page.tsx and contractors/[id]/page.tsx`
- **Verification:** partly. The links are as stated: 26 of 29 lack each one. But 12 of the 26 without a W-9 link note it as on file. The plan already schedules 'W-9 and COI tracking through the portal' for weeks 3 to 5 (plan line 494), and ADMIN-029 says contractors will upload through the portal later. This adds the Request action, pending state and toast to that planned work. It's useful detail for that build, not a separate gap, and it comes after cutover, so low. The Mercury and Gusto references fit the pattern, but I didn't confirm those exact ids.

### ADMIN-I18

**On phones, open the contractor record on Jobs, with Details and Notes one tap away**

Low · Design change · effort S · `Contractor record on phones` · The phone is a chosen subset, and touch has no hover

- **Migration branch:** Still applies on the migration branch. It is worse on the branch. At 375 the Contact card (8 fields plus the note) comes first, then the new Portal access card, and Jobs starts at 952px of a 1,297px page, about 1.4 screens down on Zack's record (8 open jobs).
- **Today:** At 375 the Contact card (8 fields) comes first and Jobs starts about 1.1 screens down. The page is 2,998px tall.
- **Why:** On a phone the jobs are calling him and checking his open work. Jobber's iOS record puts the name, a call icon and one primary action at the top, then Client | Work | Notes tabs, so each part is one tap away.
- **Change:** Below 768px, after the name and the Call, Text and Email row, add a segmented control 'Jobs | Details | Notes' with Jobs selected. Tablet and desktop keep the rail layout from ADMIN-021.
- **Desktop, tablet, phone:** Phone only. Tablet 768 and desktop 1280 are unchanged. At 320 the three short labels fit on one row.
- **Reuse:** The segmented control in src/app/(app)/deals/filters.tsx, with ADMIN-021's rail content as the Details panel.
- **References:** 
  - [Jobber](https://mobbin.com/screens/7c66f8f1-8ea8-4582-98bf-a0f88dcccf56): iOS client record: name, call icon, full-width Create, then Client | Work | Notes tabs
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:41`, `eval at 375: Contact 157, Portal access 729, Jobs 952, page 1297`, `branch src/app/(app)/contractors/[id]/page.tsx:62-136`
- **Verification:** partly. Measured at 375 (verify-ADMIN/zack--mobile-light.png): the page is 2,998px tall and the 8-field Contact card fills the first screen. But the Jobs heading sits at y=729, about 1.1 screens down, not 1.5. ADMIN-021 already sets the phone order (header buttons, then details two-up, then Jobs). ADMIN-019 folds Done away, which leaves Zack with 4 visible rows. With those in place, putting Jobs first on phones gets the benefit without a three-way switch. A Notes segment for one or two lines of text is overkill. This conflicts with ADMIN-021's phone layout, so pick one. The Jobber iOS reference shows the tab pattern, but its record has far more content per tab.

### ADMIN-V03

**Saving one settings tab shows a false conflict on the other**

Low · Fix · effort S · `/settings (CapEx rules), /settings/move-in-form` · Every save is safe, instant and undoable

- **Migration branch:** Still applies on the migration branch. Both editors still send the shared AppConfig.updatedAt. app-config-write.ts and move-in-form/actions.ts are unchanged, and AppConfig still has one updatedAt for both columns (schema.prisma:695-701 on the branch). A move-in form save would still make the next CapEx edit fail with a false conflict. Writes are blocked, so this wasn't reproduced live.
- **Today:** Found in the code; writes are blocked here, so I couldn't trigger it live. Both editors send AppConfig.updatedAt as their version, and saveAppConfigAtVersion rejects any save whose version doesn't match the row. A move-in form save bumps that same updatedAt. So if Pieter saves the move-in form while Connor has CapEx rules open, Connor's next cell edit is reverted with 'Someone else saved changes to this since you opened it. Reload the page…', although no CapEx rule changed. The move-in action's comment claims the two tabs can't clobber each other.
- **Why:** A false conflict on a two-person config throws away a valid edit and tells the user something untrue about what happened.
- **Change:** Version each column on its own: add capexRulesUpdatedAt and moveInFormUpdatedAt, or compare a hash of the column being replaced. Each editor sends and checks only its own version.
- **Desktop, tablet, phone:** No layout change at any size.
- **Reuse:** saveAppConfigAtVersion in src/lib/app-config-write.ts; the AppConfig model; CONFLICT_MESSAGE in src/lib/action-result.ts.
- **Code:** `src/lib/app-config-write.ts:13-33`, `prisma/schema.prisma:342-348`, `src/app/(app)/settings/move-in-form/actions.ts:29-36`, `src/app/(app)/settings/capex-rules-editor.tsx:209-223`, `branch src/lib/app-config-write.ts:13-33`, `branch prisma/schema.prisma:695-701`, `branch src/app/(app)/settings/move-in-form/actions.ts:29-36`, `branch src/app/(app)/settings/capex-rules-editor.tsx:209-223`
- **Verification:** verifier-found
