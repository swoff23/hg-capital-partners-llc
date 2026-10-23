# What leaves the app: printouts, PDFs and the Google listing

Part of the [UI/UX review](README.md). 38 findings: 0 critical, 2 high, 10 medium, 26 low.

## How it should work

Everything that leaves HG is a document HG means to send: named, dated and checked before it goes. The app is for working; what leaves is for reading.

Layer one is the print and link baseline. Every page gets a real title, so a saved PDF is "767 Prospect Ave" instead of "HG Capital OS.pdf". Cmd-P prints the record alone on white paper, headed the way Wise heads a statement: whose document, the period, "Generated on" and the page count (https://mobbin.com/screens/3b7399b8-5690-4e88-b0c3-a2758ecb1568). A link sent by text comes back to the same record after sign-in, which matters the week contractors get logins.

Layer two is a few documents built on purpose, each one item in a record's ⋯ menu. The property summary for a lender or insurer uses Jobber's Client view to choose what the recipient sees (https://mobbin.com/screens/a45964e6-5e62-4f49-80d8-471c37935d18). The profit and loss statement downloads from the report's own filter bar, as in Mercury Books (https://mobbin.com/screens/99ec13be-6d6c-40de-8848-c1041ba2578f), with Gusto's sync line beside Download so nothing leaves on a 51-day-old sync (https://mobbin.com/screens/1bf4cc38-732e-4473-8bd2-9f39da6c9c34). Portfolio generates the SREO and statement of values the way Mercury generates a custom statement (https://mobbin.com/screens/74accd0e-00bb-49b2-91aa-b9d6063452e5). Contractors produce a January 1099 list, a report Gusto keeps in its library (https://mobbin.com/screens/03db4d9d-48c0-49b9-81b5-966134ffcf92). The resident keeps a copy of the move-in record, as Jobber offers clients (https://mobbin.com/screens/2786f3f3-f53b-4845-8b5f-8bbb8cc054cb). Lists export the current view, named the way Attio names it (https://mobbin.com/screens/4e6934cc-b936-43f9-a098-f7d7868fadf6), and on iPhone a document opens in the share sheet like Wise's PDF receipt (https://mobbin.com/screens/59943f29-80c7-4999-9b80-79294981aeee).

Layer three hands things over without attachments: a read-only link that expires and can be cancelled, like Wise's payment link (https://mobbin.com/screens/57d58a0f-3fe8-4a8b-a94f-2de1c24f1e72).

The public face is the other half. A listing goes live only when it has a photo and a rent, as Airbnb holds publishing until a listing is ready (https://mobbin.com/screens/05e08aba-5239-4382-9ced-4954a8d4ae44). The listing editor shows the Google result it will produce, as Shopify does under every product (https://mobbin.com/screens/42de96c7-36ce-4672-a0d9-a492ed9b65fa), and prints Zillow's property sheet with a QR code for showings (https://mobbin.com/screens/054efedc-b428-473a-bda1-69a797f8b657). Underneath sit one canonical host, robots, a sitemap, "Apartments in Buffalo, NY" titles, structured data and share previews set once, like Shopify's (https://mobbin.com/screens/ebc40fa7-029e-4a13-ba12-6055ea47232e).

None of this adds chrome to the working app. It is removal in print, one ⋯ menu per record, and a handful of documents that live in spreadsheets today.

<details><summary>What the reviewer covered</summary>

Print (headless Chromium, print media emulated, page.pdf on US Letter with 0.4in margins and background graphics off, which is the browser default; each PDF page rendered to PNG and read): /properties/cmtg25y4p0006jphsv3frndk6 (767 Prospect, 4 pages), /financials (2 pages), /financials/rent-roll (1 page; the local DB has no rent lines, so the grid is empty), /deals/cmtg25yd8002cjphs49ovlvob (2 pages), /tasks/cmtg25z7s048mjphsikewzpy1 (1 page), /tasks (1 page), /contractors/cmtg25y9x000djphsbqty81fr (4 pages). Dark theme print: property, financials, deal. WebKit print-media check on /tasks and the property (DOM measures plus a full-page shot; WebKit can't write a PDF). For every printed page I measured the clipped scroll boxes, visible controls, header position and body colors. Public print, signed out: /residents/moving-in blank (8 pages) and with four ratings and one comment filled in, /rentals and /welcome. Public head and SEO: curl signed out on localhost for /, /welcome, /rentals, /residents, /residents/moving-in, /login, /robots.txt, /sitemap.xml, /favicon.ico, /tasks and /properties/[id] (title, description, robots, canonical, og, icons, h1/h2, JSON-LD, links). Production checks: hgcapitalpartners.com apex and www; www robots.txt, sitemap.xml, /login and /rentals; hgcapitalpartnersllc.com (apex, www, /rentals over http and https); the hg-capital-partners-llc.vercel.app alias (/, /welcome, /residents, /rentals, /login, /residents/moving-in), tested twice and confirmed as the same build by matching JS chunk hashes. Screens: /welcome at desktop, tablet and mobile and /login at desktop and mobile, signed out. Two web searches tested the Google result. Mobbin: 12 screen searches and 1 flow search covering web and iOS. Not reached: a rent roll with real data (code only), Safari's real print dialog and iOS print (emulated print media only), Search Console (no access), and the Home page print (out of scope).

</details>

## Findings

### G1E-001

**Printouts stop silently at the scroll box: /tasks prints about 14 of 193 open tasks**

High · Fix · effort S · `Print of /tasks, /properties/[id] Tasks card and /deals/[id] timeline (Table primitive and two inner scroll boxes)` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** /tasks (Today) and /tasks/all are page-scroll lists now, so they print in full. The print probe found no clipped box, with 236 rows printing 17,969px on /tasks/all. Three boxes still clip in print: the property Tasks card's list (739px of content prints in a 420px box), the Table primitive with its 70vh box (/contractors prints 739px of a 1,412px table), and the deal timeline, still max-h-[520px].
- **Why:** A printout that looks complete but isn't is worse than none, because the reader can't tell anything is missing. Stripe, QuickBooks and Xero reports print every row with the header repeated on each page.
- **Change:** Drop /tasks from the scope. Add print:max-h-none print:overflow-visible to Table in ui.tsx, the property Tasks ul and ActivityTimeline on the deal page.
- **Desktop, tablet, phone:** The same CSS applies everywhere. Printing from desktop Chrome or Safari, iPad Safari (Share, Print) or iPhone lays the page out at paper width, so the fix covers all three and nothing drops.
- **Reuse:** Extend Table in src/components/ui.tsx. Edit the scroll boxes at properties/[id]/page.tsx:178 and deals/[id]/page.tsx:106.
- **References:** 
  - [Airtable](https://mobbin.com/screens/115bb780-e94d-457a-9f8e-92a7e9c15312): Print view and Download CSV sit together in the view's menu and act on the whole view, not the visible viewport.
  - [Mercury](https://mobbin.com/screens/0ed937d6-2d8c-4339-80a7-39382499d3cb): The list ends on a plain count (12 Transactions) and exports with one quiet Export All, so the reader knows the printout is complete.
  - [QuickBooks](https://mobbin.com/screens/f878fc90-b80b-403a-b7d8-cb4bc2926df7): The report is a document: every line shows and the header and footer frame it, with no inner scroll.
  - [Xero](https://mobbin.com/screens/9494b39d-0962-4253-81ce-bb0a8fcaab6f): The balance sheet renders full height as a page, ready to export.
- **Code:** `G1E/print-tasks-light.pdf`, `src/components/ui.tsx:170-178`, `src/app/(app)/properties/[id]/page.tsx:178`, `src/app/(app)/deals/[id]/page.tsx:106`, `recheck-07/print-all.pdf`, `recheck-07/print-property.pdf`, `recheck-07/print-contractors.pdf`, `branch:src/components/ui.tsx:191-200 (Table maxHeight 70vh)`, `branch:src/app/(app)/properties/[id]/page.tsx:195 (max-h-[420px])`, `branch:src/app/(app)/deals/[id]/page.tsx:107 (max-h-[520px])`, `Tool: scratchpad/review/tools/b07-print.mjs (print-media probe on :3300)`
- **Verification:** confirmed. Reproduced in my own Letter PDF: /tasks prints one page with 14 of 193 rows (verify-G1E/v-tasks-light-p1.png). Print-media probe: the Table wrapper is 9,103px tall inside a 560px box, the property Tasks UL is 1,072 in 420, and the deal timeline OL is 875 in 520 (v-property-light-p4.png, v-deal-light-p1.png). Code at ui.tsx:170-178, properties/[id]/page.tsx:178 and deals/[id]/page.tsx:106 matches. Chromium already repeats thead by default. The real print trap is the sticky Th (ui.tsx 'sticky top-0'), which should go static in print. The QuickBooks reference f878fc90 is real (I saw it in a Mobbin search): a report card with title, period and a basis/timestamp footer. Ship this as one print stylesheet together with 003, 008, 009, 010, 022 and 028.

### G1E-003

**The fixed app header prints on every page and covers the first lines of each page**

High · Fix · effort S · `Print of every signed-in page (AppShell)` · One design system, fixed in the primitives

- **Today:** The header is position: fixed (app-shell.tsx:63), so the hamburger, the 'HG Capital OS' wordmark and the search box print at the top of every page. On pages 2 and 3 of the 767 Prospect printout it sits on top of content, hiding the 'Exterior Siding' row and the 'Strategy' label. The back link and the main area's top padding print too.
- **Why:** A printed record should open with the record. The bar is a Stripe invoice PDF or a QuickBooks report, which carry no app chrome. Hidden rows also mean lost content.
- **Change:** In print, hide the header, the aside, the drawer backdrop and the back link (print:hidden), and reset main's padding (print:p-0). Put the print letterhead from G1E-011 in their place.
- **Desktop, tablet, phone:** Applies to print from any device. Screen layouts are untouched.
- **Reuse:** AppShell in src/components/app-shell.tsx.
- **References:** 
  - [Wise](https://mobbin.com/screens/3b7399b8-5690-4e88-b0c3-a2758ecb1568): The statement PDF carries one letterhead at the top of page one and nothing from the app's chrome.
  - [Stripe](https://mobbin.com/screens/3401eb4e-f2b1-470a-8d27-b1733af6b237): The invoice PDF preview shows the document as paper, separate from the editor around it.
  - [Stripe](https://mobbin.com/screens/b7115150-79d8-4ffa-80cc-b8229c93404d): The Invoice PDF preview contains only the document, with no dashboard chrome.
  - [QuickBooks](https://mobbin.com/screens/f878fc90-b80b-403a-b7d8-cb4bc2926df7): The report body stands alone, apart from the app frame.
- **Code:** `src/components/app-shell.tsx:63`, `src/components/app-shell.tsx:104-108`, `src/components/app-shell.tsx:193`
- **Verification:** confirmed. Reproduced. The fixed header repeats at the top of every PDF page. On page 2 of 767 Prospect it covers the Exterior Siding row (v-property-light-p2.png), and on page 2 of the contractor printout it covers the first job row (v-contractor-light-p2.png). One small correction: the aside sits off canvas at paper width (no lg breakpoint), so it never prints. The header and back link do. Hiding the aside is harmless anyway. The Stripe invoice-preview reference is plausible, and QuickBooks f878fc90 is verified.

### G1E-002

**Lockbox codes print on every property printout**

Medium · Fix · effort S · `Print of /properties/[id], Units & access` · One design system, fixed in the primitives

- **Today:** Units & access prints each unit's lockbox code ('🔒 7676' on all three units of 767 Prospect). The same code shows on screen to every signed-in user. The exposure comes only from printing or saving the internal working page as a PDF and passing it on.
- **Why:** Door codes on paper or in an emailed PDF put tenants at risk the moment the document is forwarded. Finance products mask sensitive values (Mercury shows a card as ••9932) in anything that can be seen or shared.
- **Change:** Add print:hidden to the lockbox span (edit-units.tsx:201-202) and leave codes out of every generated document (G1E-004, G1E-031) unless someone explicitly opts in. The screen view stays as it is.
- **Desktop, tablet, phone:** Print from any device hides the code. The on-screen view at 1280, 768 and 375 is unchanged.
- **Reuse:** The lockbox span in src/app/(app)/properties/[id]/edit-units.tsx.
- **References:** 
  - [Jobber](https://mobbin.com/screens/a45964e6-5e62-4f49-80d8-471c37935d18): Client view checkboxes decide what the recipient sees on the PDF; codes should simply never be in the outgoing set.
  - [Mercury](https://mobbin.com/screens/138c6f01-a48a-4aa3-abfa-7d623e97f162): Card numbers appear masked ('••9932') in detail panels.
- **Code:** `src/app/(app)/properties/[id]/edit-units.tsx:201-202`
- **Verification:** partly. Reproduced: verify-G1E/v-property-light-p2.png shows '7676' beside all three units. Severity is overstated. The code is also on screen for every signed-in user, and it only leaves the building when someone prints the working page and forwards it. G1E-004's purpose-built summary is the main fix for documents meant for third parties. The span also uses a padlock emoji (edit-units.tsx:201), which breaks the house rules 'No emojis in product copy' and 'single-color line icons in the app'. Replace it with a line icon while there. I couldn't spot-check the Mercury reference. Stripe's payment detail masks the card as '•••• 6442' (https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b) and backs the same point.

### G1E-004

**Add 'Download summary (PDF)' to the property: a one-page lender and insurer summary**

Medium · New capability · effort M · `Property hub header ⋯ menu, plus a new Letter-size property summary` · The QuickBooks mirror is honest about what it covers

- **Today:** Printing the property page gives four pages of app chrome, internal tasks, an upload box, 'No notes yet', lockbox codes and a clipped title. The facts a lender or insurer needs are mostly empty in the data today: carrier, policy number, premium, loan amount, rate and payment are '—' on all four sample properties.
- **Why:** The Stripe bar is one click to one clean page that reads as if the company made it on purpose. Lenders and insurers ask for the same handful of facts on every refi and renewal.
- **Change:** Add 'Download summary (PDF)' and 'Print' to the property header ⋯ menu (the menu PROPERTY-038 proposes). The summary fits one Letter page:
- Letterhead: 'HG Capital Partners', the address, the entity and 'As of Oct 22, 2026'.
- A figure row: value, purchase price and date, loan balance (PROPERTY-002), LTV, rate and maturity.
- Units: label, beds and baths, rent when known.
- Insurance: carrier, policy number, renewal date, coverage, replacement cost.
- Building systems with year and condition, and the 5-year CapEx total.
Leave out tasks, notes, lockbox codes, utility account numbers and empty fields. Name the file '767-Prospect-Ave-summary-2026-10-22.pdf'. Build it as a print-styled route (/properties/[id]/summary) printed to PDF by the browser. Render the PDF on the server later, only if it needs to go out as an email attachment.
- **Desktop, tablet, phone:** Desktop 1280: the ⋯ menu item opens the PDF or the print dialog. Tablet 768: the same through Safari's share sheet. Phone 375: the PDF opens in the iOS share sheet (Download, Share, Mail). The document is a fixed Letter page, so nothing drops at any size.
- **Reuse:** New summary route. The ⋯ menu uses React Aria Menu (approved). The data comes from the property page's existing queries.
- **References:** 
  - [Jobber](https://mobbin.com/screens/90de695b-5410-4843-a1ab-630f5ea06a3d): The shared quote is a readable page with Download PDF top right and Sent on and Approved on dates in the header.
  - [Jobber](https://mobbin.com/screens/a45964e6-5e62-4f49-80d8-471c37935d18): A compact Client view row of checkboxes picks which sections the recipient sees: lender (rents, loan) versus insurer (systems, replacement cost).
  - [Stripe Dashboard](https://mobbin.com/screens/187975d8-3298-45c2-bb31-933aa892f69a): On iPhone every record sheet ends in one pinned Share action; that is where the property summary lives on phone.
  - [Stripe](https://mobbin.com/screens/de9b8395-9d09-4450-9e76-344d8f068e4d): Download PDF sits in the record header next to the shareable link.
  - [Stripe](https://mobbin.com/screens/b7115150-79d8-4ffa-80cc-b8229c93404d): Preview the exact PDF before it leaves.
  - [Xero](https://mobbin.com/screens/9494b39d-0962-4253-81ce-bb0a8fcaab6f): Document layout: title, entity and 'As of' date, then grouped figures.
  - [inDrive](https://mobbin.com/screens/e7ce7ac5-22ca-4d50-9bcf-8aaddf7da919): On phone, the PDF preview offers Download, Share and Mail.
- **Code:** `G1E/print-property-light.pdf`
- **Verification:** partly. The observation about ⌘P is accurate (v-property-light-p1..p4.png). The Stripe reference de9b8395 is verified: an invoice header with the hosted link and a 'Download PDF' button. Severity is high only if the underlying data exists, and it mostly doesn't. Across 767 Prospect, 118 Congress, 647 Prospect and 58 Mariner, the Insurance carrier, policy number and premium are all '—', and loan amount, rate and payment are '—' (only lender or servicer plus replacement cost are filled). Because the recommendation leaves out empty fields, today's summary would be a thin page. Pair it with filling loan and insurance data, or it ships hollow.

### G1E-005

**Export a profit and loss statement as a PDF that states the period, property and basis**

Medium · New capability · effort M · `/financials header, Export menu, plus a new P&L statement PDF` · The QuickBooks mirror is honest about what it covers

- **Today:** The printout is as described. QuickBooks, the declared system of record, already produces a period/basis P&L, and the app's mirror currently warns that it doesn't reconcile and was last synced 51 days ago.
- **Why:** Accountants and DSCR lenders ask for a P&L for a stated period and property, on a stated basis. QuickBooks and Xero produce exactly that as a document. CSV export (FINANCIALS-068) serves spreadsheets but not the filing.
- **Change:** Add an Export menu (PDF, CSV) at the right of the Financials control row. The PDF is a standard statement: centered 'Profit and loss', 'HG Capital Partners', the property or 'All properties', 'Jan 1 to Sep 30, 2026'. Below that come income lines and Total income, expense lines by category and Total expense, then NOI. The footer reads 'Cash basis · QuickBooks synced Sep 2, 2026 · Generated Oct 22, 2026 · Page 1 of 1'. Period and property come from the page's current controls (FINANCIALS-001). The confirm dialog title names them, as Stripe's 'Download report, 1 Jan to 10 Dec' does. Name the file 'PL-767-Prospect-2026-01-to-09.pdf'.
- **Desktop, tablet, phone:** Desktop and tablet: an Export menu at the end of the control row. Phone: Export moves into the header ⋯ and the PDF opens in the share sheet. The statement itself is a fixed Letter page.
- **Reuse:** New statement layout fed by the existing P&L aggregation in financials. React Aria Menu (approved).
- **References:** 
  - [Mercury](https://mobbin.com/screens/99ec13be-6d6c-40de-8848-c1041ba2578f): Books report with month chips and a download icon at the end of the filter bar; the file matches the months selected.
  - [Mercury](https://mobbin.com/screens/00c8f4dd-af66-45f9-9748-10bc2ad290fc): Report drilldown downloads exactly what the filter chips show (period and category chips sit beside the download icon).
  - [Gusto](https://mobbin.com/screens/1bf4cc38-732e-4473-8bd2-9f39da6c9c34): One Download menu offers CSV, PDF and Excel, next to a 'Changes synced (data updated about 2m ago)' line.
  - [Wise](https://mobbin.com/screens/3b7399b8-5690-4e88-b0c3-a2758ecb1568): Statement header states the period with timezone and a Generated on date, the same facts the P&L must state.
  - [QuickBooks](https://mobbin.com/screens/f878fc90-b80b-403a-b7d8-cb4bc2926df7): Centered title, company and period; 'Accrual basis | timestamp' footer; print and export icons.
  - [QuickBooks](https://mobbin.com/screens/c3150118-8724-4a16-9568-a14b5b754000): Format choice of Excel, CSV or PDF, plus a file name.
  - [Stripe](https://mobbin.com/screens/b7dd016d-5f5f-4923-aecd-08c88d8646dc): The download dialog title carries the period.
  - [Revolut](https://mobbin.com/screens/35965c96-4f3b-4351-b235-b7eb602f7255): PDF or Excel, start and end month, then a 'ready' toast with Download.
- **Code:** `src/app/(app)/financials/page.tsx:31`, `src/app/(app)/financials/_components/ui.tsx:109`
- **Verification:** partly. The print observation is reproduced (v-financials-light-p1/p2.png): tabs, Refresh button, amber banner, '(5 mo)' with no dates, bars missing, and 'Σ' footnote on page 2. The QuickBooks reference f878fc90 is real and supports the statement layout. Severity is overstated, though. The page itself says QuickBooks is the system of record, and the finding admits QuickBooks already produces this exact statement (P&L by Class covers per-property). The mirror also shows 'The last sync didn't reconcile to the cent' and 'synced 51d ago'. A lender-facing PDF built from an unreconciled, stale mirror risks figures that don't match the books. Build it only for views QuickBooks can't make, and disable Export while the sync is stale or unreconciled.

### G1E-007

**The vercel.app alias serves a second copy of the public site, and its dynamic pages return 500**

Medium · Fix · effort S · `Production host hg-capital-partners-llc.vercel.app` · Rentals, residents and the public site run one lifecycle

- **Today:** https://hg-capital-partners-llc.vercel.app runs the same production build as www (identical JS chunk hashes). On that host, /, /welcome and /residents return 200 with no canonical and no X-Robots-Tag. /rentals, /login and /residents/moving-in return 500 on every request (tested twice) while returning 200 on www.
- **Why:** A second crawlable host splits ranking with www. A crawler or a forwarded link that lands there sees server errors on the rentals page.
- **Change:** In Vercel Domains, redirect the .vercel.app production alias with a 308 to https://www.hgcapitalpartners.com, keeping the path. As a backstop, have src/proxy.ts send public routes on any non-canonical host to www. Then find why dynamic pages fail on that host. The canonical tags in G1E-016 back this up.
- **Desktop, tablet, phone:** Not applicable (host level).
- **Reuse:** Vercel project domain settings, or src/proxy.ts with a widened matcher.
- **Code:** `curl https://hg-capital-partners-llc.vercel.app/rentals → 500 (x2); https://www.hgcapitalpartners.com/rentals → 200`, `curl https://hg-capital-partners-llc.vercel.app/ → 200, <title>HG Capital Partners</title>, no X-Robots-Tag`, `src/proxy.ts:19-25`
- **Verification:** confirmed. Reproduced with curl today. hg-capital-partners-llc.vercel.app returns 200 for / and /residents, and 500 for /rentals, /login and /residents/moving-in, with x-matched-path set and no X-Robots-Tag. www returns 200 for /rentals. The pattern (every DB-backed public page fails on that host) suggests a host-dependent server error, which is worth finding even after the redirect is in place.

### G1E-008

**Charts vanish on paper because their bars are background colors**

Medium · Fix · effort S · `Print of /financials charts and the property 5-year CapEx bars` · One design system, fixed in the primitives

- **Today:** The monthly income vs expense bars, the expense-by-category bars and the CapEx year bars are spans filled with a background color. Browsers drop backgrounds when printing by default. Printed Financials shows '2026-05 -$317' rows with no bars, under a legend with no swatches. The printed property CapEx shows years and totals with no bars.
- **Why:** The comparison is the chart's whole message. On paper the heading 'Monthly income vs expense' sits over a list of net figures that shows neither.
- **Change:** Add print-color-adjust: exact to chart marks and legend swatches (Tailwind print:[print-color-adjust:exact]), or draw the marks as SVG rects, which print without background graphics. Bake this in once when charts become a shared component (VISUAL-022).
- **Desktop, tablet, phone:** Every print source. Screen charts are unchanged.
- **Reuse:** The bar spans in financials/page.tsx, financials/_components/ui.tsx, properties/[id]/capex-outlook.tsx and portfolio-capex.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/268d429c-0b02-46f6-b3a6-c5bfa29da2dc): Report charts are drawn marks with labeled axes, not background-filled boxes.
- **Code:** `src/app/(app)/financials/page.tsx:143-163`, `src/app/(app)/financials/_components/ui.tsx:67`, `src/app/(app)/properties/[id]/capex-outlook.tsx:97`, `src/app/(app)/portfolio-capex.tsx:146`
- **Verification:** confirmed. Reproduced. Monthly income vs expense prints month labels and net figures with no bars, expense-by-category prints labels and amounts only, and the CapEx year rows print without bars (v-financials-light-p1.png, v-property-light-p1.png). Code at financials/page.tsx:143-163, capex-outlook.tsx:97 and portfolio-capex.tsx:146 matches. The legend swatches (financials/page.tsx:159-163) also vanish, which leaves 'income · expense' as orphan words. I didn't spot-check the Stripe reference.

### G1E-009

**Dark theme leaks into print, so the data prints fainter than its labels**

Medium · Fix · effort S · `Print of any signed-in page in dark theme` · One design system, fixed in the primitives

- **Today:** The [data-theme=dark] tokens stay active in print (globals.css:17-26). With backgrounds off, the dark theme's near-white text prints pale gray. KPI figures ($5,080, $14,500), deal values ('425k', 'run numbers') and note text print lighter than their uppercase labels, and card borders print as heavy dark outlines.
- **Why:** The hierarchy inverts on paper: the numbers are the faintest thing on the page.
- **Change:** In globals.css, add @media print { :root, :root[data-theme="dark"] { light token values; color-scheme: light } } so every printout uses light tokens whatever the theme toggle says.
- **Desktop, tablet, phone:** Every print source. On-screen dark mode is unchanged.
- **Reuse:** Tokens in src/app/globals.css.
- **References:** 
  - [Wise](https://mobbin.com/screens/3b7399b8-5690-4e88-b0c3-a2758ecb1568): The statement renders black on white regardless of the app's theme.
  - [Stripe](https://mobbin.com/screens/a7282f10-2f3d-4de2-8cde-1d5ad2c25dbf): The PDF preview is plain white paper with a Letter page size setting, independent of the dashboard styling.
  - [Xero](https://mobbin.com/screens/9494b39d-0962-4253-81ce-bb0a8fcaab6f): Reports are always dark ink on white, regardless of app styling.
- **Code:** `src/app/globals.css:17-26`
- **Verification:** confirmed. Reproduced in verify-G1E/v-financials-dark-p1.png. With data-theme=dark, KPI figures ($5,080, $6,984) print pale gray while their labels print darker, and card borders print as heavy dark outlines. globals.css:17-26 has no print override. This belongs in the same print stylesheet as 001 and 003.

### G1E-010

**Buttons, composers, dropzones and empty-field placeholders print as if they were content**

Medium · Design change · effort S · `Print of /tasks/[id], /deals/[id], /tasks, /financials and /properties/[id]` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. The branch has no print styles: no print: classes under src/app or src/components, and no @media print in globals.css. The print probe found visible controls on every route: 127 on /tasks; 483 on /tasks/all (filter row, segmented control, '+ New task', and a checkbox and a date-chip button per row); on /tasks/[id] the composer ('Reply to Device', 'Internal', 'Send'), 'Add item' and the 'Add notes' placeholder; on the property page 'Click to upload or drag files here' and 'Edit'; on the deal page 'Add a note…' and 'Add'; on financials 'Refresh from QuickBooks'. The top bar with search prints too.
- **Today:** These all print:
- Buttons and links: 'Mark complete', 'Refresh from QuickBooks', '+ New task', the Financials tabs and 'Show accrual basis'.
- Status selects with their chevrons.
- The deal note composer ('Add a note…' and Add).
- 'Click to upload or drag files here' boxes on the task and property pages.
- The whole Tasks filter bar.
Empty fields print their placeholders as if they were values: 'What is this task about?', 'Paste a listing URL…', and 'Comment (optional)' 46 times on the move-in form. Inputs also cut off long values, because input text can't wrap.
- **Why:** Paper can't be clicked. Controls and placeholder text are noise that reads as data, and a lender can't tell 'What is this task about?' from a real description.
- **Change:** Give the primitives print variants. Button, LinkButton, the upload box, composers and filter rows get print:hidden. Input, Select and Textarea print as plain text: print:border-0 print:p-0 print:appearance-none print:placeholder:text-transparent, with wrapping allowed. Empty optional fields are hidden in print.
- **Desktop, tablet, phone:** Every print source. Screen behavior at every size is unchanged.
- **Reuse:** Button, Input, Select and Textarea in src/components/ui.tsx; Attachments in src/components/attachments.tsx.
- **References:** 
  - [Stripe](https://mobbin.com/screens/a7282f10-2f3d-4de2-8cde-1d5ad2c25dbf): Editor controls (checkboxes, selects, Add item) stay on the left; the PDF on the right carries only content.
  - [Typeform](https://mobbin.com/screens/71dbe2c0-580a-4814-a068-2e13cb4a5559): The printable report is read-only text, with editing controls kept outside the document.
  - [QuickBooks](https://mobbin.com/screens/f878fc90-b80b-403a-b7d8-cb4bc2926df7): Controls sit above the report frame, never inside it.
- **Code:** `print probe: /tasks shows 1,584 visible controls in print media`, `Tool: scratchpad/review/tools/b07-print.mjs (visible-control counts)`
- **Verification:** confirmed. Reproduced. I count 1,587 visible controls on /tasks, with 8 per row (checkbox button, title input, two selects, three buttons, date input). The task page prints 'Mark complete', a status select chevron, 'What is this task about?' and the upload box (v-task-light-p1.png). The deal page prints 'Paste a listing URL…' and the note composer (v-deal-light-p1.png). On the filled move-in printout (v-movein-filled-p2.png), 'Comment (optional)' prints darker than the real item labels ('Cabinets'), so placeholders literally outrank content. The title input cuts the property address ('767 Prospect Avenue, Buffalo,').

### G1E-017

**Titles that say 'Apartments in Buffalo, NY' so Google stops confusing HG with Hg**

Medium · Design change · effort S · `Public page titles and descriptions (/, /rentals, /residents)` · Rentals, residents and the public site run one lifecycle

- **Today:** Home is titled 'HG Capital Partners', with the description 'Thoughtfully maintained apartments in Buffalo, New York.' Rentals is 'Rentals | HG Capital Partners' with 'Available apartments in Buffalo, New York.' A web search for 'hgcapitalpartners.com' returned only Hg, the London buyout firm. A search for 'HG Capital Partners Buffalo rentals' returned nothing from the site. The home page's only indexable text is one sentence.
- **Why:** The name collides with a large, well-known firm, and the title is the strongest signal Google has that this is a Buffalo landlord. A credible result names the place and the offer.
- **Change:** Use title.template '%s · HG Capital Partners' in the marketing layout.
- Home: 'HG Capital Partners · Apartments in Buffalo, NY', described as 'Apartments on Prospect Ave, Lafayette Ave and Congress St in Buffalo, NY. See what's available.'
- Rentals: 'Apartments for rent in Buffalo, NY'.
- Residents: 'Resident resources'.
Keep descriptions under about 155 characters, and pull the street names from the properties table so the copy stays true.
- **Desktop, tablet, phone:** Not applicable (search result and browser tab). Shorter titles also fit phone tabs.
- **Reuse:** Metadata in src/app/(marketing)/*/page.tsx and the marketing layout.
- **References:** 
  - [Shopify](https://mobbin.com/screens/ebc40fa7-029e-4a13-ba12-6055ea47232e): Home page title and meta description fields with '0 of 70 characters used' and '0 of 320' counters beside a share preview.
  - [Shopify](https://mobbin.com/screens/42de96c7-36ce-4672-a0d9-a492ed9b65fa): Search engine listing block shows the exact Google title, URL and description that a page will produce.
  - [Zillow](https://mobbin.com/screens/995fe812-b973-4797-b97a-c7635c074716): A rental listing leads with the business name, the full address and a website link, the facts a search result should carry.
- **Code:** `src/app/(marketing)/welcome/page.tsx:5-8`, `src/app/(marketing)/rentals/page.tsx:5-8`, `WebSearch 'hgcapitalpartners.com' → only hgcapital.com results`
- **Verification:** confirmed. Titles and descriptions verified by curl ('HG Capital Partners' / 'Thoughtfully maintained apartments in Buffalo, New York.'; 'Rentals | HG Capital Partners'). The welcome page's only body copy is one h1 sentence plus two buttons (welcome/page.tsx). I didn't re-run the web search. The Zillow Mobbin reference is a weak fit for a search-title finding, but a copy fix doesn't need one. The proposed copy follows the house rules.

### G1E-I11

**Check QuickBooks freshness before financial figures leave the app**

Medium · Design change · effort S · `Financials (P&L and rent roll export or print)` · The QuickBooks mirror is honest about what it covers

- **Today:** Financials shows 'synced 51d ago · reconciliation off' and an amber notice, and both already print with the page. But the sync time is relative, so on paper or a screenshot it has no date. No download menu exists yet.
- **Why:** A lender or accountant reading a P&L can't see that it came from a sync 51 days old that didn't reconcile. Gusto prints 'Changes synced (data updated about 2m ago)' right beside its Download button, and Stripe puts 'Data updated' with the exact time next to Download CSV.
- **Change:** The Download item for any financial document carries a sublabel with the data date ('QuickBooks data from Sep 2'). If the last sync is older than a day, the first item becomes 'Refresh, then download'. If the last sync didn't reconcile, the item reads 'Figures don't reconcile yet' and downloads only on a second, deliberate click.
- **Desktop, tablet, phone:** Same menu at every width. Phone: the sublabel shortens to 'Data from Sep 2' and stays on one line.
- **Reuse:** SourceBadge freshness logic in src/app/(app)/financials/_components/ui.tsx, syncNow in financials/settings/actions.ts (refresh-button.tsx), React Aria Menu (approved).
- **References:** 
  - [Gusto](https://mobbin.com/screens/1bf4cc38-732e-4473-8bd2-9f39da6c9c34): 'Changes synced (data updated about 2m ago)' sits on the same row as Download.
  - [Stripe](https://mobbin.com/screens/79c56edc-71a5-4a60-824c-67957ce2dede): '25 rows · Data updated 10 December 2024 at 08:00' beside Download CSV.
- **Code:** `src/app/(app)/financials/_components/ui.tsx:94-105 (SourceBadge stale rule)`
- **Verification:** partly. The claim that figures would leave 'with no check' is partly wrong. A print of /financials today already carries the 'QuickBooks · Cash basis · synced 51d ago · reconciliation off' line and the amber notice (vv-print-financials-p1.png). What's wrong on paper is that '51d ago' is relative, so a printout or screenshot read a week later has no anchor. The recommended second-click gate adds friction and isn't what the cited references do: Gusto 1bf4cc38 (confirmed) and Stripe show a data-updated line beside Download, not a gate. Simpler and closer to the references: stamp an absolute 'QuickBooks data as of Sep 2, 2026, not reconciled' on every financial output and show the same date as the menu sublabel; keep 'Refresh, then download' when stale. The menu itself depends on G1E-005.

### G1E-IV01

**Give texted public links a preview card with a property photo**

Medium · New capability · effort S · `Public site link previews (/welcome, /rentals, /residents, /residents/moving-in)` · Rentals, residents and the public site run one lifecycle

- **Today:** Public pages set only a title and description. There is no og:title, og:image or metadataBase, and favicon.ico is the only icon (no apple-touch icon). An eval on /rentals returns 'no og:image | no og:title', and /welcome's meta tags are charset, viewport and description only. A /rentals or /residents/moving-in link texted to a prospect or resident unfurls in iMessage or WhatsApp as a bare link.
- **Why:** Text is how these links leave HG: a showing follow-up, a move-in report link sent to a new resident. The unfurled card is the first impression and decides whether the link gets tapped. Dub puts a Link Preview editor (image, title, description) beside every link for exactly this reason. A bare link from an unknown domain reads less credible than a Zillow link with a photo.
- **Change:** Set metadataBase to https://hgcapitalpartners.com in the root layout. Give each public page an openGraph block that reuses its existing title and description ('Rentals | HG Capital Partners', 'Available apartments in Buffalo, New York.') plus a 1200x630 real property photo, per the house imagery rule. Add an apple-icon so saved links and home-screen shortcuts show the HG mark. Signed-in pages get no preview image.
- **Desktop, tablet, phone:** No on-page change at any width. Phone: iMessage and WhatsApp show a photo card with title and domain. Desktop: Slack, email and LinkedIn show the same card. Nothing drops.
- **Reuse:** Next metadata API (metadataBase, openGraph, and the opengraph-image and apple-icon file conventions) in src/app/layout.tsx and src/app/(marketing)/*/page.tsx; no UI component.
- **References:** 
  - [Dub](https://mobbin.com/screens/e2c543ca-1008-4900-ba35-8079d7d7e8af): Link Preview editor: the image, title and description a shared link unfurls with, set deliberately rather than left to chance.
  - [Shopify](https://mobbin.com/screens/ebc40fa7-029e-4a13-ba12-6055ea47232e): 'Social sharing image and SEO' sets one image, title and description with a live preview card.
  - [Dub](https://mobbin.com/screens/d6eeaa09-3696-4e8c-beb9-20248d744998): Custom Link Preview with Google, X, LinkedIn and Facebook tabs showing the card a shared link produces.
  - [Zillow](https://mobbin.com/screens/221935cb-ed03-417e-a82b-5df111f31fd5): 'Share this home' card: photo, price, beds, baths, sqft and address, the content a rental preview should carry.
  - [corner](https://mobbin.com/screens/63b6a49d-bf8b-4773-837c-f44d4bb1d351): A shared place link previews with a photo, the place name with its street address, and a one-line description.
  - [Bluesky Social](https://mobbin.com/screens/2de32498-340a-4ec3-9342-a1bd2c522009): A DM link preview: large image, title, one-line description and domain.
- **Code:** `src/app/layout.tsx:9-12 (no metadataBase or openGraph)`, `grep: no openGraph, metadataBase, opengraph-image or apple-icon anywhere under src/app`, `curl http://localhost:3200/welcome and /rentals: no <meta property="og:…"> or twitter: tags`, `grep -rn 'openGraph' src: no matches`, `src/app/(marketing)/layout.tsx`, `src/app/layout.tsx:9-12`, `src/app/not-found.tsx:6`
- **Also found as:** G1E-V02 (What leaves the app: printouts, PDFs and the Google listing), PUBLIC-047 (Login and the public site)
- **Verification:** verifier-found

### G1E-011

**Printed pages don't say whose document it is, which record, or when it was printed**

Low · Design change · effort S · `Print of every signed-in page (letterhead, page setup, file name)` · One design system, fixed in the primitives

- **Today:** App printouts carry the generic title 'HG Capital OS' and browser-default page setup. Chrome's default headers and footers already add the date, URL and page numbers. What's missing is the record's name in the title (so also in the PDF file name) and an @page size and margin.
- **Why:** A page that leaves the company needs a letterhead and a date. QuickBooks prints company, report, period and 'Accrual basis | timestamp'. Semrush stamps 'Generated on'.
- **Change:** Add a print-only header in AppShell with 'HG Capital Partners' at left and the record title at right. Add a print-only footer: 'Printed Oct 22, 2026 by Connor · Page 1 of 3' (using @page margin boxes in Chrome 131+, with a plain footer elsewhere). Pages with synced figures add 'QuickBooks data as of Sep 2, 2026'. Set @page { size: letter; margin: 0.5in }. Per-page titles from SHELL-018 give files real names.
- **Desktop, tablet, phone:** Print-only, so it is invisible on screen at 1280, 768 and 375. It prints the same from desktop, iPad and iPhone.
- **Reuse:** New print-only block in AppShell, using the first name from the signed-in user.
- **References:** 
  - [Wise](https://mobbin.com/screens/3b7399b8-5690-4e88-b0c3-a2758ecb1568): Letterhead with legal entity and address, document title, period, Generated on date and a 1/1 page count in the footer.
  - [Jobber](https://mobbin.com/screens/6d8028ff-4026-4e2c-870e-3993a62f1ef7): One brand setting is shown on the client hub, emails and all PDFs, with a preview of the document page.
  - [Stripe](https://mobbin.com/screens/79c56edc-71a5-4a60-824c-67957ce2dede): '25 rows · Data updated 10 December 2024 at 08:00' beside Download CSV: the data date travels with the export.
  - [QuickBooks](https://mobbin.com/screens/f878fc90-b80b-403a-b7d8-cb4bc2926df7): Company, report title and period up top; basis and timestamp in the footer.
  - [Semrush](https://mobbin.com/screens/a0e328b3-9f03-40cd-820a-542b78d36e85): 'Generated on' date and visible page breaks in the PDF report.
- **Code:** `src/app/layout.tsx:9-12`, `grep: no @page or print: rule anywhere in src`
- **Verification:** partly. Every app page's title is 'HG Capital OS' (verified) and there is no @page rule (grep). The observation overstates the gap, though. Chrome's ⌘P has headers and footers on by default, and they already print the date, the page title, the URL and 'page x of y'. What's really missing is a real per-page title (SHELL-018, which also fixes the PDF file name) and @page size and margins. A custom letterhead plus margin-box footer duplicates what Chrome prints, and it only works in Chrome 131+. Keep it to @page plus per-page titles, and add 'QuickBooks data as of' only on financial pages. QuickBooks f878fc90 is verified.

### G1E-012

**Relative dates print as relative and go stale on paper**

Low · Fix · effort S · `Print of /financials, /financials/rent-roll, /tasks and Home` · Money, numbers and dates read one way

- **Migration branch:** Still applies on the migration branch. Relative dates still print as relative, and the branch adds more of them. Financials and the property page show 'synced 51d ago'. Task rows on /tasks and /tasks/all show '2d late', '4d late' and 'Yesterday' on date chips. The /tasks/[id] activity stamps each entry with a relative age ('47m') under relative day headings ('Today').
- **Today:** Printouts carry times computed at render: 'synced 51d ago' (financials/_components/ui.tsx:109), 'yesterday' on overdue rows (TASKS-001 fixes the wording, but it stays relative), and '55d ago' on Home.
- **Why:** Paper outlives 'yesterday'. A printout read next week shows dates that are no longer true.
- **Change:** Render relative dates as <time dateTime> elements carrying both forms: relative on screen ('51d ago') and absolute in a print-only span ('Sep 2, 2026'). One helper in lib/dates.ts returns both.
- **Desktop, tablet, phone:** Screens keep the relative form at every width. Print always shows absolute dates.
- **Reuse:** relativeDays in src/lib/dates.ts and relTime in financials/_components/ui.tsx.
- **References:** 
  - [Linear](https://mobbin.com/screens/b4e6b70d-27e2-4853-8d0b-b44ab3d54967): Each relative choice (Tomorrow, Next week) sits beside its absolute date and time, the pairing print needs.
  - [Stripe](https://mobbin.com/screens/1b402fb7-0c87-4b8d-874e-77c55d6da8eb): Export ranges (Current month, Last 7 days) show the resolved dates next to each label.
  - [QuickBooks](https://mobbin.com/screens/f878fc90-b80b-403a-b7d8-cb4bc2926df7): Report footer gives an absolute timestamp.
  - [Gusto](https://mobbin.com/screens/1bf4cc38-732e-4473-8bd2-9f39da6c9c34): Relative freshness ('updated about 2m ago') on screen, beside the Download menu that produces the document.
- **Code:** `src/app/(app)/financials/_components/ui.tsx:86-109`, `src/lib/dates.ts:104-111`, `branch:src/app/(app)/financials/_components/ui.tsx:86-91`, `branch:src/lib/dates.ts:143-166 (yesterday, Nd ago, Nd late)`, `branch:src/app/(app)/tasks/[id]/page.tsx:163 (fmtAgo) and activity.tsx:89,118`, `Tool: scratchpad/review/tools/b07-print.mjs (rel matches on /tasks, /tasks/all, /properties/[id], /financials)`
- **Verification:** partly. 'synced 51d ago' prints (v-financials-light-p1.png), and relTime and relativeDays are as cited. This is real but minor. Paper is an occasional output, and Chrome's own header stamps the print date, so the reader can work the relative date back. On /tasks every overdue row reads 'yesterday' even for 2025 due dates. That's a wrong-data bug other units own (TASKS-001), and it matters far more than the relative format. A dual-format <time> helper is fine as part of the print pass. Low.

### G1E-013

**The rent grid will cut off later months and the Total column on portrait paper**

Low · Fix · effort S · `Print of /financials/rent-roll` · One design system, fixed in the primitives

- **Today:** Printing the rent grid today fits, because there are about 5 months of data. In my simulation the grid cut off the latest months and the Total column once data spanned about 9 or more months, because both wrappers clip horizontally.
- **Why:** Total and the most recent months are exactly the columns a lender reads.
- **Change:** Give the rent roll a landscape print page (@page rentroll { size: letter landscape } and page: rentroll on its main element) and add print:overflow-visible to both wrappers. Short addresses (FINANCIALS-030) and 'Jan' month headers keep 14 columns inside 10 inches.
- **Desktop, tablet, phone:** Print only. The screen grid's phone treatment is FINANCIALS-030.
- **Reuse:** The Table print extension from G1E-001; Card in ui.tsx.
- **References:** 
  - [Mercury](https://mobbin.com/screens/99ec13be-6d6c-40de-8848-c1041ba2578f): Months as columns with month chips to pick which months show, so a printout can be limited to what fits the page.
  - [Stripe](https://mobbin.com/screens/a7282f10-2f3d-4de2-8cde-1d5ad2c25dbf): PDF page size is an explicit setting (Letter), so the wide grid can be laid out landscape on purpose.
  - [Xero](https://mobbin.com/screens/9494b39d-0962-4253-81ce-bb0a8fcaab6f): A multi-period comparison report fits its columns to the page with the totals kept.
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:35-46`
- **Verification:** partly. Not reproducible with local data, but I simulated it by injecting columns into the live page. With 5 months, the table is 641px in a 641px box and fits on portrait Letter. With 12 months, it is 1,024px in 641px, and months 9 to 12 plus Total are cut off (verify-G1E/v-rentroll-sim12-p1.png vs v-rentroll-sim5-p1.png). getRentRoll (queries.ts:318) shows every month with any rent line, with no cap, so the cut-off arrives after about 8 months of synced data. Financials shows '(5 mo)' today, so it fits now. Low until then. Month headers render as '26-01' (m.slice(2)), which the FINANCIALS unit should own.

### G1E-014

**Keep /login, the move-in form and the app out of Google's index**

Low · Fix · effort S · `/login, /residents/moving-in, signed-in routes and /api` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** New branch pages are noindex: /login/forgot, /login/reset and the portal /p all send noindex, nofollow. /login still has no robots meta and now serves contractors too. /residents/moving-in still has none, the (app) layout has none, and /api responses carry no X-Robots-Tag.
- **Why:** For a brand search, Google can show the sign-in page as a sitelink, which looks like an internal tool exposed to the public. An indexed form attracts bot submissions that can use up the shared daily cap and lock out a real tenant.
- **Change:** Add robots { index: false, follow: false } to /login and /residents/moving-in, and robots { index: false } to the (app) layout. Add X-Robots-Tag: noindex for /api/* in next.config.ts. The forgot, reset and portal pages are already done.
- **Desktop, tablet, phone:** Not applicable.
- **Reuse:** Next metadata API (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md).
- **Code:** `curl http://localhost:3200/login: no <meta name="robots">, title 'Sign In | HG Capital Partners'`, `src/app/login/page.tsx:8-11`, `src/app/(marketing)/residents/moving-in/page.tsx:7-10`, `src/app/(marketing)/residents/moving-in/actions.ts:16-17`, `curl :3300/login, /residents/moving-in: no robots meta; /login/forgot, /login/reset, /p: noindex, nofollow`, `branch:src/app/login/page.tsx:10-13 (metadata without robots)`, `branch:src/app/login/forgot/page.tsx:10, src/app/login/reset/page.tsx:15, src/app/(portal)/p/layout.tsx:6`
- **Verification:** partly. Facts verified: /login has no robots meta, and signed-in routes 307 to /login. The reasoning is weak for two of the three asks. Bots reach /residents/moving-in through the public /residents link whether or not it's indexed. The honeypot and the per-IP and global caps are the real defense. Noindexing the page also hides the move-in checklist (deposit, utilities, insurance) from tenants who search for it. robots in the (app) layout is moot, because those routes never render to a crawler. Noindex on /login is a reasonable low-cost tidy-up.

### G1E-015

**Add robots.txt and a sitemap, then submit the sitemap in Search Console**

Low · Fix · effort S · `/robots.txt and /sitemap.xml` · Rentals, residents and the public site run one lifecycle

- **Today:** /robots.txt and /sitemap.xml both return 404 (served as the HTML not-found page titled 'HG Capital OS'), locally and on www.hgcapitalpartners.com.
- **Why:** Google finds and recrawls pages sooner from a sitemap, and Search Console needs one to report what is indexed. Today a search for the site turns up nothing from it.
- **Change:** Add src/app/robots.ts: allow /, disallow /login, /api and the app routes, and point to https://www.hgcapitalpartners.com/sitemap.xml. Add src/app/sitemap.ts listing /, /rentals and /residents, with lastModified taken from the newest listing update, and add each listing page once PUBLIC-011 exists. Verify the domain through metadata.verification and submit the sitemap.
- **Desktop, tablet, phone:** Not applicable.
- **Reuse:** Next file conventions (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md and sitemap.md).
- **Code:** `curl http://localhost:3200/robots.txt → 404`, `curl https://www.hgcapitalpartners.com/robots.txt → 404; /sitemap.xml → 404`
- **Verification:** partly. Verified: robots.txt and sitemap.xml return 404 on localhost and www. Google treats a 404 robots.txt as 'allow everything', so nothing is blocked today. A sitemap of 3 URLs adds little until listing pages exist (PUBLIC-011). The useful part is verifying the domain in Search Console. Low, S.

### G1E-016

**Declare one canonical URL: set metadataBase and canonical tags**

Low · Fix · effort S · `All public pages (head)` · Rentals, residents and the public site run one lifecycle

- **Today:** No public page sets metadataBase or a canonical link. / and /welcome return identical HTML (the proxy rewrite), and the .vercel.app alias serves the same page again (G1E-007).
- **Why:** With duplicates and no canonical tag, Google picks the canonical itself, and the chosen URL can be /welcome or the vercel.app host.
- **Change:** Set metadataBase to new URL('https://www.hgcapitalpartners.com') in src/app/layout.tsx. Give each public page alternates.canonical: '/' for welcome, '/rentals', '/residents'. Optionally 308 an external /welcome request to /.
- **Desktop, tablet, phone:** Not applicable.
- **Reuse:** Next metadata (metadataBase, alternates).
- **Code:** `curl head of / and /welcome: identical, no <link rel="canonical">`, `src/app/layout.tsx:9-12`, `src/proxy.ts:19-25`
- **Verification:** partly. Verified: there is no metadataBase or canonical tag anywhere in src. /welcome isn't linked from any public header, footer or page (grep), so Google rarely sees it as a duplicate of /. The real duplicate host is the vercel.app alias, which G1E-007's 308 removes. Canonical tags are a cheap backstop. Low.

### G1E-018

**Add Organization JSON-LD so Google can tell HG Capital Partners apart from Hg**

Low · New capability · effort S · `/ (public home) structured data` · Rentals, residents and the public site run one lifecycle

- **Today:** No public page carries structured data (no application/ld+json anywhere in src).
- **Why:** Structured data is how Google ties a name to a place, a site and a logo. It is the main lever against the name collision, and it feeds a knowledge panel once a Google Business Profile exists.
- **Change:** On the home page, add a JSON-LD Organization following Next's JSON-LD guide: name 'HG Capital Partners', legalName 'HG Capital Partners LLC', url, logo (the HG mark from SHELL-019), email, areaServed 'Buffalo, NY', and sameAs (the Zillow rental profile, plus the Google Business Profile once claimed). Claiming that profile under the same name and site is the off-app half.
- **Desktop, tablet, phone:** Not applicable.
- **Reuse:** New script tag in src/app/(marketing)/welcome/page.tsx (guide: node_modules/next/dist/docs/01-app/02-guides/json-ld.md).
- **References:** 
  - [Zillow](https://mobbin.com/screens/995fe812-b973-4797-b97a-c7635c074716): Business name, address, website and phone shown together, the same facts Organization data declares.
- **Code:** `curl of all public pages: 'application/ld+json' absent`, `src/app/(marketing)/welcome/page.tsx:5-8`
- **Verification:** partly. Verified: no application/ld+json anywhere in src. 'It is the main lever against the name collision' is overstated. A claimed Google Business Profile, consistent name, address and phone, and descriptive titles (G1E-017) do more. Organization markup is a modest supporting signal. Also there is no HG logo to declare yet: the favicon is still the default Vercel triangle (see G1E-V01). Low.

### G1E-019

**Share a document with a lender through an expiring link instead of downloading and re-attaching it**

Low · New capability · effort M · `Property Documents and task Attachments (row menu)` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. /api/files is still for signed-in people only. The branch adds contractor access, but only to Shared files on a job assigned to them (spec §5.3). There is no expiring view link for an outsider such as a lender.
- **Today:** Documents are served only to signed-in users through /api/files (route.ts:32-50), which is correct. The side effect is that handing an insurance policy or lease to a lender means downloading it and attaching it to an email, with no record in the app of what was sent, when, or whether it was opened.
- **Why:** The Ramp and Stripe way to hand something over is a link: set an expiry, see that it was opened, revoke it. It also closes the loop the house rules ask for, a record of what was done.
- **Change:** In each document's row menu, add 'Share link…', which opens a small dialog with 'Expires after' (24 hours, 7 days or 30 days) and 'Copy link'. Links are signed and view-only. Under the document they show as 'Shared Oct 22 · expires Oct 29 · opened twice' with Revoke. Generated PDFs (G1E-004, G1E-005) use the same dialog.
- **Desktop, tablet, phone:** Desktop and tablet: a compact dialog. Phone: a bottom sheet whose Copy link hands off to the native share sheet (navigator.share), so Mail or Messages opens directly.
- **Reuse:** /api/files/[kind]/[id] route (add a signed-token path); React Aria dialog and sheet (approved); ConfirmDialog for Revoke.
- **References:** 
  - [Wise](https://mobbin.com/screens/57d58a0f-3fe8-4a8b-a94f-2de1c24f1e72): A shared link record: 'Expires in 5 days', exact expiry time, Share, Created on and a red Cancel payment link.
  - [Airtable](https://mobbin.com/screens/0629eb66-1657-4902-8cae-2e50855f2909): New link dialog with Permission: Read only and 'Only allow emails from' a domain, which fits sending to one lender.
  - [Airbnb](https://mobbin.com/screens/fd46076d-8ec1-4336-800c-b03c4f671a76): 'Review your request' shows the exact email and listing card the recipient will get before Send.
  - [1Password](https://mobbin.com/screens/5fd7541c-b9b0-4cdb-92a2-30f3417b43d0): Link expires after 7 days, available to anyone with the link, optional view-once, Copy link. Small and complete.
  - [Dropbox](https://mobbin.com/screens/2c727400-dc3c-4d94-b213-8001b2c90909): Expiration date and require-email options on link creation.
  - [Proton](https://mobbin.com/screens/ef4fcd7f-0f50-47de-9df4-b67bf14bda2d): Expiry plus 'Stop sharing', which removes everyone's access.
- **Code:** `src/app/api/files/[kind]/[id]/route.ts:32-50`, `branch:src/app/(app)/tasks/[id]/files-list.tsx:67-80 (row menu: Delete only)`, `Spec §5.3 (/api/files principals)`
- **Verification:** partly. /api/files is session-gated as described. Effort is understated. Signed tokens, a public route with security headers, open tracking, and revoke and status UI add up to about L, not M. For two partners who send a handful of documents a year, attaching a file works. The 'Shared · expires · opened twice' status line under every document adds the clutter the brief warns against. If built, keep it to 'Copy link (expires in 7 days)' with no tracking line. The references are plausible but not spot-checked.

### G1E-020

**Export a statement of values for the insurance renewal**

Low · New capability · effort M · `/properties (Portfolio) Export menu` · The QuickBooks mirror is honest about what it covers

- **Today:** The schema has the insurance and size fields, but carrier, policy number and premium are empty on the sample properties (only replacement cost is set). An exported statement of values would be mostly blank today.
- **Why:** Commercial property renewals start with a statement of values. The data is already in the app, so retyping it is pure waste.
- **Change:** Add an Export menu to the Portfolio header with 'Schedule of real estate owned' (PORTFOLIO-030) and 'Statement of values', each as CSV or PDF. One row per property: address, entity, units, sq ft, roof, electrical and plumbing years, replacement cost, coverage, deductible, carrier, policy number and renewal date, with a totals row. Year built isn't stored: add the field or leave the column out.
- **Desktop, tablet, phone:** Desktop and tablet: the Export menu at the right of the page header. Phone: inside the header ⋯, and the file goes to the share sheet. The PDF is landscape Letter.
- **Reuse:** New export built on the property queries; React Aria Menu (approved); the SREO pipeline from PORTFOLIO-030.
- **References:** 
  - [Mercury](https://mobbin.com/screens/74accd0e-00bb-49b2-91aa-b9d6063452e5): Documents & Data with Year and Account pickers and a 'Generate a custom statement' link.
  - [Stripe](https://mobbin.com/screens/b7dd016d-5f5f-4923-aecd-08c88d8646dc): Download dialog titled with the range ('Download report, 1 Jan to 10 Dec') and a Columns choice.
  - [Square](https://mobbin.com/screens/469e75a3-e1b7-4c59-8387-0801e4c10294): The export dialog chooses all items or filtered items, and the file format.
  - [Wise](https://mobbin.com/screens/430281d0-8b4c-4c56-bdbe-9be3dfdef812): A side sheet picks PDF or CSV, then one Download button.
- **Code:** `prisma/schema.prisma Property: replacementCost, sqft, insuranceCarrier, insurancePolicyNo, insuranceCoverage, insuranceDeductible, insurancePremium, insuranceRenewalDate`
- **Verification:** partly. The schema fields exist (schema.prisma:116-139), but the data mostly doesn't. Insurance carrier, policy number and premium are '—' on all four sample properties I read, and only replacement cost is filled. A statement of values today would be a column of dashes. It is an annual task, and it overlaps the PORTFOLIO-030 export menu. Low until the insurance data is filled.

### G1E-021

**Print task lists as a walk-through checklist, not as a form**

Low · Design change · effort M · `Print of /tasks and the property Tasks card` · One design system, fixed in the primitives

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Task rows are no longer forms. On /tasks/all each row prints as an empty circle, the full title, the address, an initials avatar and a date chip, so it already reads close to a checklist. What remains: the app chrome, tabs, filter row and '+ New task' print. Every row takes two lines, so 236 open tasks print as 17,969px, about 17 Letter pages. Owners print as initials only ('PL', 'CS'). Rows aren't grouped by property, and no line summarizes the filter. Near dates print relative ('2d late', 'Yesterday'). The property Tasks card still clips at 420px.
- **Why:** People print task lists to walk a property with a pen. Asana and Linear print lists as text, and a punch list should read that way too.
- **Change:** Write print styles for TaskRow: one line per row, the owner's first name instead of initials, an absolute date, and the chrome hidden. Print the current filter as one header line and group rows by property. 'Print checklist' in the property Tasks card still fits.
- **Desktop, tablet, phone:** Print layout only. From iPad or iPhone, Safari's share sheet prints the same checklist. The screen lists at 1280, 768 and 375 are unchanged.
- **Reuse:** Task row components with print variants; TaskCheckbox prints as an empty square.
- **References:** 
  - [Things 3](https://mobbin.com/screens/7c058278-81b9-46f6-8ef6-2136cec2462c): The Today list menu ends in Share, which sends the list as a plain checklist.
  - [Things 3](https://mobbin.com/screens/2c1ef140-10c5-48b8-93a8-b53313948a43): Project menu groups Share after a divider, below the record actions.
  - [Etsy](https://mobbin.com/screens/170d4ec3-a4ff-410a-a51b-f07f9109fbac): Print dialog chooses what goes on paper (packing slips, receipts, notes).
  - [Coda](https://mobbin.com/screens/b83d0995-331e-4d18-80ef-017df4b69216): 'Print & PDF' lives in the document ⋯ menu with ⌘P shown.
- **Code:** `recheck-07/print-all.pdf`, `branch:src/app/(app)/tasks/task-row.tsx:70-130`
- **Verification:** partly. Most of this is 001 plus 010. Once the list stops clipping and the inputs print as text, /tasks prints as a text list. Grouping by property, a filter line and a new 'Print checklist' menu item rest on an unverified assumption that the team prints punch lists. The settled contractor portal (My jobs, By property) is the planned field tool, and a new menu item adds chrome. The Etsy and Coda references are about print menus in general, not checklists.

### G1E-022

**Cards split across pages and headings print alone at the bottom of a page**

Low · Design change · effort S · `Print of /properties/[id] and /deals/[id] (page breaks)` · One design system, fixed in the primitives

- **Today:** The property Tasks card's header prints alone at the foot of page 3, with its rows on page 4. Building CapEx and Details split mid-table with no repeated column header. The deal timeline breaks mid-entry between pages 1 and 2.
- **Why:** Orphaned headings and split tables make a printout look accidental.
- **Change:** Add break-inside: avoid on Card and SectionCard when they are shorter than a page, break-after: avoid on CardHeader and section headings, and repeat thead (G1E-001).
- **Desktop, tablet, phone:** Print only.
- **Reuse:** Card, SectionCard and CardHeader in src/components/ui.tsx.
- **References:** 
  - [Semrush](https://mobbin.com/screens/a0e328b3-9f03-40cd-820a-542b78d36e85): The PDF report shows planned page breaks between whole blocks.
- **Code:** `src/components/ui.tsx:6-21`, `src/components/ui.tsx:29-60`
- **Verification:** confirmed. Reproduced. The property Tasks card header lands alone at the foot of page 3 (v-property-light-p3.png), and the deal timeline breaks mid-entry at the page boundary (v-deal-light-p1/p2.png). break-inside: avoid on taller cards is simply ignored by browsers, so the rule is safe as written.

### G1E-023

**The second domain forwards over plain http and drops the path**

Low · Fix · effort S · `hgcapitalpartnersllc.com (second domain)` · Rentals, residents and the public site run one lifecycle

- **Today:** hgcapitalpartnersllc.com and its www return a 301 to http://www.hgcapitalpartners.com, a plain-http hop before Vercel's 308 to https. Paths aren't kept: /rentals on the llc domain returns 404 over both http and https.
- **Why:** Anyone who types or saved the llc address lands on a 404 or takes an extra insecure hop. Redirects should keep the path and go straight to the canonical https URL.
- **Change:** Add hgcapitalpartnersllc.com to the Vercel project as a redirect domain (308 to https://www.hgcapitalpartners.com, path kept) and turn off the registrar forward. Owner memory notes it is a separate DNS zone (ns49/ns50), so confirm with dig before editing.
- **Desktop, tablet, phone:** Not applicable.
- **Reuse:** Vercel domain settings.
- **Code:** `curl -D - https://hgcapitalpartnersllc.com/ → 301 location: http://www.hgcapitalpartners.com`, `curl https://hgcapitalpartnersllc.com/rentals → 404; http://hgcapitalpartnersllc.com/rentals → 404`
- **Verification:** confirmed. Reproduced. https://hgcapitalpartnersllc.com/ returns 301 to http://www.hgcapitalpartners.com/, and /rentals returns 404 on both http and https. The apex hgcapitalpartners.com correctly sends a 308 to www with the path kept.

### G1E-024

**The public site prints pale, with headings lighter than body text**

Low · Design change · effort S · `Print of the public site (/residents/moving-in, /rentals, /residents)` · One design system, fixed in the primitives

- **Today:** Public pages hard-code #e8eaee and #767d8a text on #080b12. With backgrounds off, headings ('Moving in', 'Security deposit', 'Tell us how everything looks.', the listing addresses) print pale gray, lighter than the body copy, and the gold eyebrows print faint.
- **Why:** Tenants print the move-in steps to stick on the fridge, and a pale page with inverted hierarchy reads as unfinished.
- **Change:** Add a print rule on the marketing shell: white page, zinc-900 text, headings darker than body, gold only on the eyebrow rule, and links underlined.
- **Desktop, tablet, phone:** Print only. The on-screen public palette stays fixed near-black at every size.
- **Reuse:** MarketingLayout in src/app/(marketing)/layout.tsx; the public token set in PUBLIC-049.
- **Challenges:** Personality: the public site is fixed near-black (#08090b) and ignores the theme toggle. Print would be the one exception, because paper doesn't print backgrounds.
- **References:** 
  - [Zillow](https://mobbin.com/screens/054efedc-b428-473a-bda1-69a797f8b657): Zillow does not print the web page; it offers 'Print listing sheet', a purpose-built page for paper.
  - [Lemonade Insurance](https://mobbin.com/screens/4fb854cb-31da-4289-8725-808f5a7ddf7f): A dark, branded product still hands out a black-on-white document.
- **Code:** `src/app/(marketing)/layout.tsx:13`
- **Verification:** confirmed. Reproduced: 'Moving in', 'Security deposit' and 'Tell us how everything looks.' print paler than body copy (v-movein-light-p1.png, v-movein-filled-p2.png). conflicts_with names the public-palette rule correctly. The cited colors are slightly off: the marketing layout uses bg #080b12 and text #f2f4f7 (layout.tsx:13), and the house rule says #08090b and #e8eaee. That drift is for the PUBLIC unit.

### G1E-025

**Printing the move-in steps gives 8 pages, 7 of them a blank form**

Low · Design change · effort S · `Print of /residents/moving-in` · Rentals, residents and the public site run one lifecycle

- **Today:** Printing /residents/moving-in to keep the checklist gives 8 Letter pages: one page of steps (deposit, utilities, insurance, keys), then seven pages of the blank 46-item report, with 'Comment (optional)' under every line plus the name and email fields.
- **Why:** The steps are the part a tenant wants on paper. The report is filled in on the phone.
- **Change:** In print, show only the steps with their timing and one line: 'Fill in your move-in report at hgcapitalpartners.com/residents/moving-in'. The finished report prints its own copy through G1E-006.
- **Desktop, tablet, phone:** Print only. Tenants printing from a phone (Share, Print) get the same single page.
- **Reuse:** Sections in src/app/(marketing)/residents/moving-in/page.tsx.
- **References:** 
  - [Etsy](https://mobbin.com/screens/170d4ec3-a4ff-410a-a51b-f07f9109fbac): Choose what gets printed instead of printing the whole screen.
- **Code:** `G1E/print-movein-light.pdf`
- **Verification:** confirmed. Reproduced: 8 Letter pages, with 46 'Comment (optional)' placeholders counted (v-movein-light.pdf).

### G1E-026

**Links print as dead words: 'View ↗', 'Zillow ↗', 'Map it in Financials → Settings'**

Low · Design change · effort S · `Print of /contractors/[id], /properties/[id] Rentals and Financials` · One design system, fixed in the primitives

- **Migration branch:** Still applies on the migration branch. /contractors/[id] still shows W-9 and COI as 'View ↗' links. The property Rentals editor still shows 'Zillow ↗', and property Financials still shows 'Map it in Financials → Settings'. With no print styles, all of them print as dead link text.
- **Today:** Contractor W-9 and COI print as 'View ↗' when a file exists and '—' when not. In-app links ('Map it in Financials → Settings', 'Review', 'Zillow ↗') print as link-colored text that can't be followed on paper.
- **Why:** On paper a link is just colored text, and 'View ↗' says nothing about whether the W-9 is on file.
- **Change:** In print, document links show their state ('On file') instead of 'View'. In-app navigation links hide or print as plain text. External listing links print their short URL after the text, for external links only.
- **Desktop, tablet, phone:** Print only.
- **Reuse:** The link spans in contractors/[id]/page.tsx, edit-listings.tsx and the property Financials card.
- **References:** 
  - [Xero](https://mobbin.com/screens/9494b39d-0962-4253-81ce-bb0a8fcaab6f): Drill-down links are on screen only; the exported document is plain figures.
- **Code:** `src/app/(app)/contractors/[id]/page.tsx:57`, `src/app/(app)/contractors/[id]/page.tsx:66`, `src/app/(app)/properties/[id]/edit-listings.tsx:250`, `branch:src/app/(app)/contractors/[id]/page.tsx:76-90`, `branch:src/app/(app)/properties/[id]/edit-listings.tsx:250`, `branch:src/app/(app)/properties/[id]/financials.tsx:27`
- **Verification:** partly. The links print as described (v-contractor-light-p1.png). One claim is overstated: 'View ↗' renders only when a W-9 or COI URL exists, and '—' otherwise (contractors/[id]/page.tsx:53-68), so on paper it does say a file is on file. The point that in-app links print as link-blue text with nothing to click stands.

### G1E-027

**Collapsed Utilities and Equipment sections print as empty headings**

Low · Design change · effort S · `Print of /properties/[id], Units & access` · One design system, fixed in the primitives

- **Today:** Units & access prints three units, each with '> Utilities' and '> Equipment' rows and nothing under them, because the accordions are collapsed.
- **Why:** An empty heading on paper looks like missing data.
- **Change:** In print, hide the toggles, or print Equipment expanded as a small table (type, year, condition). The property summary PDF (G1E-004) lists equipment per unit and leaves utility account numbers out.
- **Desktop, tablet, phone:** Print only.
- **Reuse:** The unit accordion in src/app/(app)/properties/[id]/edit-units.tsx.
- **References:** 
  - [Zillow](https://mobbin.com/screens/b70152e9-d180-4390-8dda-ad79e9cc99db): 'Facts & features' groups unit facts as short labeled lists with no toggles.
- **Verification:** confirmed. Reproduced: three units, each with '> Utilities' and '> Equipment' and nothing under them (v-property-light-p2.png).

### G1E-028

**Card shadows print as heavy gray frames on some cards and not others**

Low · Design change · effort S · `Print of /properties/[id] and /financials (card frames)` · One design system, fixed in the primitives

- **Today:** In the generated PDF, the 5-year CapEx, Building CapEx, Rentals, Details, Loan, Insurance and Operating expense cards print with a thick gray frame from shadow-sm. Financials (property) and Units & access print with a hairline. Neighboring cards look different on paper.
- **Why:** Inconsistent frames make the printout look uneven, and shadows mean nothing on paper.
- **Change:** Add print:shadow-none to Card and SectionCard and keep the 1px border, or drop it and separate sections with headings, in line with VISUAL-009.
- **Desktop, tablet, phone:** Print only.
- **Reuse:** Card (ui.tsx:9) and SectionCard (ui.tsx:43).
- **References:** 
  - [QuickBooks](https://mobbin.com/screens/f878fc90-b80b-403a-b7d8-cb4bc2926df7): The report uses rules and whitespace, not floating cards.
- **Code:** `src/components/ui.tsx:9`, `src/components/ui.tsx:43`
- **Verification:** confirmed. Reproduced. 5-year CapEx, Building CapEx, Rentals, Details, Loan, Insurance, Description and Attachments print with a thick gray frame, while Financials and Units & access print with a hairline (v-property-light-p1/p2.png, v-task-light-p1.png). Fold it into the single print stylesheet.

### G1E-029

**Mark up available listings with rent, beds, baths and availability once each has its own page**

Low · New capability · effort S · `/rentals (and future listing pages) structured data` · Rentals, residents and the public site run one lifecycle

- **Today:** /rentals shows three available listings, and the listing record stores rent, beds, baths, sq ft and an available date (PUBLIC-027). None of it is marked up, and listings have no URLs of their own (PUBLIC-011).
- **Why:** Structured facts help Google match 'apartment for rent Prospect Ave Buffalo' to an HG listing. Google has no rental rich result for this, so expect better matching rather than stars, and keep the markup small.
- **Change:** When listing pages exist, add JSON-LD per available listing: an Apartment (or SingleFamilyResidence) with address, numberOfBedrooms, numberOfBathroomsTotal, floorSize and image, and an Offer with price, priceCurrency USD, availability and availabilityStarts. Only listings with a rent and a photo qualify. Leased listings and 'Price on request' cards get none.
- **Desktop, tablet, phone:** Not applicable.
- **Reuse:** Listing query in src/app/(marketing)/rentals/page.tsx.
- **References:** 
  - [Zillow](https://mobbin.com/screens/558ec748-c7ad-4aee-bb26-3ff3b71b8b00): Unit facts set: beds, baths, monthly price, available date, sq ft.
  - [Zillow](https://mobbin.com/screens/3837dc2a-b729-462a-b435-5d58923e6355): Listing preview leads with $/mo, beds, baths and sq ft above the address.
- **Code:** `src/app/(marketing)/rentals/page.tsx:26-48`, `curl http://localhost:3200/rentals: no application/ld+json, 3 listing h2s`
- **Verification:** confirmed. Verified: no JSON-LD, and /rentals shows 'Price on request' and 'No photo yet' cards locally. The finding correctly says Google has no rental rich result and limits the markup to listings that have a rent and a photo. It depends on PUBLIC-011.

### G1E-030

**Export the current Deals or Tasks view as CSV**

Low · New capability · effort S · `/deals and /tasks filter rows` · Lists answer first and stay calm at 675 rows

- **Migration branch:** Still applies on the migration branch. There is no export on /tasks/all or /deals. /tasks/all now caps at 400 rows ('Showing first 400 of N. Narrow the filters to see the rest.'), so a CSV of the full filter is the only way to get everything out at once.
- **Today:** Deals (675) and Tasks (2,086) can only leave the app by printing, and printing clips (G1E-001). There is no CSV or copy-to-spreadsheet anywhere outside the planned financial exports.
- **Why:** A partner, broker or lender asks for 'the list'. Mercury and Stripe put Export at the end of the filter row and export what you're looking at.
- **Change:** Add a quiet 'Export' text button at the right end of the Deals and Tasks filter rows. It downloads a CSV of the current filter, with columns as shown, absolute dates and full addresses. As in Square, offer 'Matching your filters' or 'All'.
- **Desktop, tablet, phone:** Desktop 1280: at the end of the filter row. Tablet 768: same if the row fits, otherwise inside the Filters button. Phone 375: inside the Filters sheet, so the row never wraps.
- **Reuse:** New. Filter state already lives in the URL.
- **References:** 
  - [Attio](https://mobbin.com/screens/4e6934cc-b936-43f9-a098-f7d7868fadf6): Import / Export menu says 'Export view as CSV', so the scope is the current filtered view.
  - [Attio](https://mobbin.com/screens/734f2294-adaa-4abe-93b2-fcc6b0ff62d7): Completion toast names the object and the view ('Companies, All Companies: Export complete').
  - [Shopify](https://mobbin.com/screens/40c65843-06b1-4875-a272-c8b5b63e365c): Export scope choices include '5 orders matching your search' and Selected, with the count in the label.
  - [Mercury](https://mobbin.com/screens/3e5ccd40-7dbf-4fb4-a26d-915180a2cd64): 'Export all' as a quiet text action at the right of the filter row.
  - [Square](https://mobbin.com/screens/469e75a3-e1b7-4c59-8387-0801e4c10294): All items vs items matching applied filters, then the format.
  - [Stripe](https://mobbin.com/screens/8f736fe0-96d7-4c56-a2d5-a9156acc3c1e): Export payments with date range presets and default columns.
- **Code:** `branch:src/app/(app)/tasks/all/page.tsx:12,40-67 (PAGE = 400, cap notice)`, `grep: no text/csv or Export under branch src/app except edit-listings`
- **Verification:** confirmed. No export exists anywhere (grep), and print clips (001). My Mobbin query 'Mercury transactions list with export' didn't return Mercury, so I couldn't verify the Mercury URL. Square shows the same pattern, Export at the right end of the filter row (https://mobbin.com/screens/c312d376-230c-4e7e-ab4b-1340562d88b1). On phone, putting Export inside the Filters sheet respects the no-wrap rule.

### G1E-031

**Copy a job as one text message for contractors not on the portal**

Low · New capability · effort S · `/tasks/[id] ⋯ menu` · Contractor jobs and media close the loop

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. The portal replaces most of the texting this finding assumed. What's left is the wrong link for contractors.
- **Today:** /tasks/[id] now has a ⋯ menu with Copy link, Cancel task and Delete. With every contractor invited to the portal on Oct 29 (D0, D22) and D19 emails carrying 'Open job', texting the whole job becomes the exception. 'Copy link', though, copies the staff URL /tasks/<id>. A contractor who opens it is redirected to /login (307 with the portal cookie) and then to My jobs, not to the job.
- **Why:** For a contractor without a login, the text message is the job sheet. One tap should produce a complete, correct one.
- **Change:** On a contractor's job, make the menu item 'Copy Zack's job link' copy /p/jobs/<id>. Keep 'Copy for text' only for assignees with no portal login, with the same lockbox opt-in.
- **Desktop, tablet, phone:** Desktop and tablet: copies to the clipboard and shows a toast. Phone: opens the native share sheet (navigator.share) so Messages is one tap.
- **Reuse:** Task page data; the ⋯ menu from TASKS-032 via React Aria Menu (approved).
- **References:** 
  - [Linear](https://mobbin.com/screens/73891735-c12b-4ed3-bd7f-fc6bc3c52228): Record menu offers 'Copy link to comment' and 'Copy content as Markdown' as plain menu items.
  - [Stripe Dashboard](https://mobbin.com/screens/463eb6a4-b673-4863-9795-307063a33a39): Copy link confirms with a short 'Copied to clipboard' toast on iPhone.
  - [Deputy](https://mobbin.com/screens/3788b420-fc9d-4d44-a805-6d74d0e7375e): A share dialog with Copy and a confirmation toast.
  - [Sketch](https://mobbin.com/screens/4b7875fc-3502-4267-9b34-4417e7f4d177): Share and Copy Link live in the item's ⋯ menu.
- **Code:** `branch:src/app/(app)/tasks/[id]/header.tsx:50-57,68-89 (Copy link copies /tasks/<id>)`, `curl -b hg_portal=<portal> :3300/tasks/cmvkik0ht0003jpg7nflnvoun → 307 /login`, `Spec D0, D19, D22`
- **Verification:** partly. The task page has no ⋯ menu or copy action, as stated. The value is transitional: the settled contractor portal gives contractors logins, which replaces the text-message job sheet. Drop the 'Include lockbox code' checkbox, since a tick box inside a copy action is extra UI and tasks don't hold lockbox codes (units do). Compose with line breaks instead of '·' separators so it reads well in Messages.

### G1E-I05

**Print a listing sheet with a QR code for showings and the window sign**

Low · New capability · effort M · `Listing editor (property page, Rentals card)` · Rentals, residents and the public site run one lifecycle

- **Today:** No print or handout exists for a listing. But all three live listings are blank today (no photo, rent, beds, baths or date), and listings have no ⋯ menu to hold the action, only a 'Remove listing' text button in edit mode.
- **Why:** Zillow Rental Manager offers 'Print your property sheet' so renters touring a unit can apply by scanning a QR code. Showings and a 'For rent' sign in the window are where HG meets most local prospects, and today they leave with nothing that points back to HG.
- **Change:** Add 'Print listing sheet' to the listing's ⋯ menu: one Letter page in black on white with the lead photo, address and unit, rent, beds, baths, sqft, the available date, one line on how to reach HG, and a QR code to the listing page (or /rentals until listing pages exist). The same page works as the window sign. Disabled until the listing is live (G1E-I03).
- **Desktop, tablet, phone:** Desktop and tablet: opens the browser print preview. Phone: opens the PDF in the share sheet to AirPrint or send to a print shop. The sheet itself is fixed Letter at every size.
- **Reuse:** New print route beside the public site using the public tokens on white; QR generated server-side; the ⋯ menu from React Aria (approved). Based on Zillow's property sheet.
- **References:** 
  - [Zillow](https://mobbin.com/screens/054efedc-b428-473a-bda1-69a797f8b657): 'Print your property sheet' for renters touring the property; they apply by scanning the QR code.
  - [Wise](https://mobbin.com/screens/ed8071cb-70a1-4da2-b9a3-c227aa03a6ca): A QR card with Share and Download beneath it, the same two exits the sheet needs on phone.
  - [Dub](https://mobbin.com/screens/d6eeaa09-3696-4e8c-beb9-20248d744998): QR code card sits beside the link it encodes in the link editor's rail.
- **Code:** `src/app/(marketing)/rentals/page.tsx:130-150 (only action is View on Zillow)`
- **Verification:** partly. The capability is plausible for showings and a window sign, but medium overstates it. It's a new feature for three listings, none of which has a photo, rent or details today, so the sheet would print blanks until I03 lands. The QR target should be the Zillow listing, where prospects apply under the PRD note at prisma/schema.prisma:280-283, or /rentals, not a listing page that doesn't exist. The '⋯ menu' it hangs from doesn't exist either: each listing has only a red 'Remove listing' text button (p767e--rentals-edit--desktop-light.png). Spot check: Dub d6eeaa09 (QR card in the link editor rail) is confirmed. The Zillow 054efedc property-sheet screen didn't come back in an iOS Zillow search, which returned only buyer-side screens, so treat that citation as unverified.

### G1E-I09

**Give each listing page a readable address URL**

Low · New capability · effort S · `Public listing pages (future /rentals/<listing>)` · Rentals, residents and the public site run one lifecycle

- **Today:** Listings have no page or URL of their own, by design today. Per the schema note, the public card links out to Zillow, which holds the full listing.
- **Why:** The listing URL goes on the QR sheet, in texts to prospects and into Google, so people read it. Airbnb lets hosts set a custom link (airbnb.com/h/...) right in the listing editor.
- **Change:** Build listing pages at /rentals/767-prospect-ave-lower-front, generated from the address and unit label. Keep it fixed once the listing is live, and redirect the old address if a unit is renamed. No editable field needed.
- **Desktop, tablet, phone:** No visual change; on phones texted links read as an address instead of a code.
- **Reuse:** New slug column on Listing and a dynamic route under src/app/(marketing)/rentals.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/52e5c276-2708-41a3-8a74-368d69507f68): Custom link (airbnb.com/h/...) is a section card in the listing editor.
- **Code:** `src/app/(marketing)/rentals/page.tsx:91-152 (ListingCard has no link to a page of its own)`
- **Verification:** partly. True that listings have no URL of their own. But this is a sub-detail of G1E-029 (listing pages) and should be folded into it, not ranked on its own. Like I04 and I12, it builds on listing pages that run against the PRD note at prisma/schema.prisma:280-283 (Zillow is the leasing system of record; the app keeps just enough for a card), and conflicts_with doesn't say so. If G1E-029 is approved, address slugs are the right default.

### G1E-I10

**Produce the January 1099 list from contractor payments and W-9s**

Low · New capability · effort M · `Contractors (/contractors)` · The QuickBooks mirror is honest about what it covers

- **Migration branch:** Still applies on the migration branch. /contractors (now 31 rows) still shows a W-9 or COI link, or '—', in a Docs column, with no 1099 view or menu. On the branch DB, all 210 LedgerLine rows have vendorQboId null, so the mirror still can't total payments by contractor.
- **Today:** The Contractors list shows a W-9 and COI link (Google Drive) or '—' per contractor. The QuickBooks mirror doesn't link ledger lines to vendors (vendorQboId is always null) and holds only P&L lines, so it can't total contractor payments; capitalized rehab spend isn't in it.
- **Why:** Every January the accountant needs who was paid, how much, and whether a W-9 is on file. Gusto keeps '1099 tax forms' in its Reports library and Mercury files 1099s under Documents. HG has all the inputs and still assembles this by hand.
- **Change:** From December, the Contractors page menu offers '1099 list for 2026': one row per contractor paid this year with total paid (from QuickBooks), W-9 on file or missing with a link, and mailing address. Rows above the IRS reporting threshold with no W-9 are marked (confirm the 2026 threshold with the accountant). Download CSV for the accountant.
- **Desktop, tablet, phone:** Desktop and tablet: a table with total right-aligned in Geist Mono. Phone: two-line rows (name and total, then W-9 state); the CSV opens in the share sheet. Review stays mainly on desktop.
- **Reuse:** Contractors table in src/app/(app)/contractors/page.tsx, Contact.w9Url, QboVendor and LedgerLine in prisma/schema.prisma, Badge tones for missing W-9.
- **References:** 
  - [Gusto](https://mobbin.com/screens/03db4d9d-48c0-49b9-81b5-966134ffcf92): '1099 tax forms' is a standing report in the Reports library.
  - [Mercury](https://mobbin.com/screens/74accd0e-00bb-49b2-91aa-b9d6063452e5): 1099s and Recipient tax forms sit in Documents & Data, generated, not assembled.
- **Code:** `prisma/schema.prisma:186 (Contact.w9Url), 557-576 (QboVendor.contactId), 613 (LedgerLine.vendorQboId)`, `4652abb:src/app/(app)/contractors/page.tsx:55-58`, `4652abb:prisma/schema.prisma:198,910-919,966`, `psql: LedgerLine 210 rows, vendorQboId set 0`
- **Verification:** partly. The data premise is wrong. src/lib/quickbooks/sync.ts:284 always writes vendorQboId: null, so no ledger line is tied to a vendor; only the free-text payee name survives. The mirror is built from ProfitAndLossDetail only (client.ts:138, categorize.ts:81), so capitalized rehab payments, most of a rehab company's contractor spend, never reach it, and totals would badly undercount. QuickBooks, the system of record, already prepares 1099s from its own vendor ledger. What the app can add is narrow: which contractors have no W-9 link. The Docs column already shows a W-9 link or '—' (contractors/page.tsx:55-58), and those links point to Google Drive. The Gusto and Mercury references weren't spot-checked.

### G1E-I13

**Link the move-in form editor to the live public form it changes**

Low · Design change · effort S · `Settings, Move-in form editor (/settings/move-in-form)` · Rentals, residents and the public site run one lifecycle

- **Today:** Settings, Move-in form lists the rooms and items residents rate, with only Save and Cancel. Nothing links to /residents/moving-in or says that Save changes the public form the next resident fills in.
- **Why:** This editor changes something that leaves the app the moment it saves. Shopify follows a page save with 'View on your online store', and Airbnb keeps a View button floating over its listing editor so the owner checks the guest's view.
- **Change:** Add a 'View form ↗' link beside Save that opens /residents/moving-in in a new tab. After a save, the inline confirmation reads 'Saved. The next resident sees these rooms.' with the same link.
- **Desktop, tablet, phone:** Desktop and tablet: link sits left of Save and Cancel. Phone 375: 'View ↗' only, so the header row doesn't wrap.
- **Reuse:** Header actions in src/app/(app)/settings/move-in-form/move-in-form-editor.tsx; LinkButton from src/components/ui.tsx; toast is a known gap in docs/components.md, so an inline line until it exists.
- **References:** 
  - [Shopify](https://mobbin.com/screens/d3ff22b1-e8d9-4476-b269-ec8a9d0572e6): Save banner offers 'View on your online store'.
  - [Airbnb](https://mobbin.com/screens/72305d61-a101-4d39-9721-c19ca9375fc0): A View pill floats over the listing editor while editing.
- **Code:** `src/app/(app)/settings/move-in-form/move-in-form-editor.tsx:161 (Save is the only header action besides Cancel)`
- **Verification:** confirmed. Reproduced: /settings/move-in-form has only Save (disabled until dirty) and Cancel in the header and no link to /residents/moving-in (mif--desktop-light.png, move-in-form-editor.tsx:155-164). Shopify d3ff22b1 spot-checked and shows 'View on your online store' after save. Small, low-clutter and on target. The subtitle says 'tenants' while the public form says residents; pick one word when touching this.

### G1E-I14

**Copy a listing as ready-to-post text for Marketplace and Craigslist**

Low · New capability · effort S · `Listing editor (property page, Rentals card)` · Rentals, residents and the public site run one lifecycle

- **Today:** No copy action exists. Listings have no ⋯ menu, the app has no toast, and the full listing lives on Zillow, which already syndicates it, so retyping matters mainly for Craigslist and local groups.
- **Why:** Buffalo rentals move through Facebook Marketplace, local groups and Craigslist as well as Zillow. Linear treats 'Copy content as Markdown' as an ordinary menu item, and Stripe's phone app confirms a copy with a short toast. One clean text block saves retyping and keeps the facts consistent.
- **Change:** 'Copy listing text' in the listing's ⋯ menu copies one plain block: '2 bed, 1 bath apartment at 767 Prospect Ave, Buffalo. $1,450/mo. Available Nov 1. 950 sq ft. Photos and details: hgcapitalpartners.com/rentals/767-prospect-ave-lower-front'. Confirm with 'Listing copied'. Only offered once the listing is live (G1E-I03).
- **Desktop, tablet, phone:** Same at all widths. On phone the confirmation sits above the bottom bar.
- **Reuse:** Same text formatter as G1E-031 (copy a job as text); toast is a known gap in docs/components.md; React Aria Menu (approved).
- **References:** 
  - [Linear](https://mobbin.com/screens/73891735-c12b-4ed3-bd7f-fc6bc3c52228): 'Copy content as Markdown' as a plain item in the record menu.
  - [Stripe Dashboard](https://mobbin.com/screens/463eb6a4-b673-4863-9795-307063a33a39): 'Copied to clipboard' toast after Copy link.
- **Code:** `grep: no 'clipboard' or 'Copy link' anywhere under src`
- **Verification:** partly. True that src has no clipboard use. But the value is thin. Zillow, the leasing system of record per prisma/schema.prisma:280-283, already syndicates its listings across its own network. The copied text links to a listing page that doesn't exist (G1E-029). And it needs a per-listing ⋯ menu that doesn't exist either (only a 'Remove listing' text button) plus a toast, a known gap in docs/components.md. Keep it as a later nice-to-have behind I03, not a ranked finding.

### G1E-V03

**The internal app name 'HG Capital OS' leaks onto the public 404 and its search snippet**

Low · Fix · effort S · `Public 404 page and any public route without its own metadata (src/app/layout.tsx)` · Plain, consistent words

- **Today:** Root metadata is title 'HG Capital OS' and description 'Internal operating system for HG Capital' (layout.tsx:9-12). The public not-found page sets neither, so a signed-out visitor on a bad URL sees the public near-black 404 under the browser tab 'HG Capital OS'. The 404s for /robots.txt and /sitemap.xml are served with the same title.
- **Why:** A tenant or prospect with a mistyped or stale link sees the internal tool's name, and the description says 'Internal operating system' to anything that reads it. G1E-017's title template lives in the marketing layout and wouldn't cover the root not-found.
- **Change:** Make the root default title 'HG Capital Partners' with template '%s · HG Capital Partners', and give it a public description. Move 'HG Capital OS' into the (app) layout's metadata. Give not-found.tsx the title 'Page not found'.
- **Desktop, tablet, phone:** Not applicable (tab title and metadata).
- **Reuse:** Metadata in src/app/layout.tsx, the (app) layout and src/app/not-found.tsx.
- **Code:** `shoot.mjs /apartments signed out: status 404, title 'HG Capital OS'`, `src/app/layout.tsx:9-12`, `src/app/not-found.tsx:5-27`
- **Verification:** verifier-found
