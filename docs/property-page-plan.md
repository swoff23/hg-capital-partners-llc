# Property page — V1 review & plan

Assessment of `/properties/[id]` as of commit `bca4e7d`, and the plan to get it to
"V1 done" before moving to other parts of the app.

## Where it stands

**Good.** The CapEx work is genuinely strong: equipment lifecycle + building
systems + a 5-year forecast that rolls unit appliances and building systems
together, plus the portfolio rollup on the home page. Per-unit utilities/equipment
with accordions is clean. Inline hover-to-edit is a nice touch.

**The gap.** The page is a **maintenance & CapEx view**. For an investment
company the property page's first job is *"should we keep / refi / sell this, and
is anything about to blow up?"* That needs **money in** (rent), **money out**
(debt service, insurance, taxes), and **dates** (loan maturity, insurance
renewal, tax due, rental registration). None of that is on the page or in the
model. V1 deliberately scoped out "money / tenants / leases" — that call now
costs us the thing the page is most for.

---

## 0. Fix-its (do regardless of new features)

- **`Property.links` is dead.** The JSON field exists, nothing renders it. Add a
  Documents/Links card (label + URL, editable) — near-free, and every property
  has a Drive folder / appraisal / closing binder to point at.
- **`unitCount` vs `units.length` disagree silently.** Page does
  `property.unitCount ?? units.length`. Pick one source of truth: when the units
  array is populated, it *is* the count — drop the separate `unitCount` field from
  the Details form (or make it read-only/derived).
- **Orphan fields:** `replacementCost` and `rehabMonths` are in the schema, never
  shown or editable. Surface them or drop them.
- **Details is a flat 11-row `<dl>`.** Financing, acquisition, and legal/admin are
  mixed together. Group them (see §3).
- **Edits are silent.** The deal page logs edits to its Activity timeline
  (`DealNote.source === "change"`). The property page has no history at all.
- **CapEx forecast is buried** below the unit accordions. If CapEx planning is the
  priority, its headline number belongs in the summary strip (§1) and the full
  card higher up.
- **Building CapEx reads heavy** — 10 rows, mostly "Unknown". Add a completion
  hint ("4 / 10 systems dated") and consider collapsing the undated rows.

---

## 1. Summary strip (top of page, below the header)

A one-row set of stat tiles so the page answers itself at a glance. All derived
from data we have or add in §2–3:

| Tile | Source |
|---|---|
| **All-in basis** | `purchasePrice + rehabAmount + closingCosts` |
| **Value** | `value` (+ "as of" date, + source: appraisal / BPO / estimate) |
| **Equity** | `value − currentLoan` |
| **LTV** | `currentLoan / value` |
| **Cash flow / mo** | from rent roll − expenses − debt service (§2); "—" until then |
| **CapEx due soon** | `capexForecast().dueNowTotal` |
| **Next key date** | soonest of loan maturity / insurance renewal / tax due |

---

## 2. Rent roll + financials — the big one

This is the single highest-value addition and the reason to touch the model now.

### Units → real table

Units currently live in `Property.units` JSON (label, lockbox, utilities,
equipment). Rent roll wants **sortable rent, lease-end dates for renewal
reminders, and portfolio-level occupancy** — none of which JSON gives us.

**Recommendation: promote units to a `Unit` model.** The data is tiny (2–6 units
× 11 properties), and V1 is the moment — before more UI ossifies around the JSON
shape. New `Unit`: `propertyId`, `label`, `lockboxCode`, `utilities Json`,
`equipment Json`, plus the rent-roll fields:

- `tenantName`, `occupancyStatus` (Occupied / Vacant / Notice given / Turning)
- `rent` (Decimal), `leaseStart`, `leaseEnd`, `depositHeld` (Decimal)
- `marketRent` (Decimal) — for loss-to-lease

### Monthly financials snapshot

Per property, manual entry to start (later: pull from Baselane / QuickBooks):

- **Income:** gross scheduled rent (from rent roll), other income, vacancy loss
- **Expenses:** taxes, insurance, water/sewer, common utilities, property mgmt,
  R&M, **CapEx reserve**, misc
- **NOI** = income − expenses
- **Debt service** (from §3) → **cash flow**

### Ratios (once rent + expenses exist)

Cap rate (on value *and* on cost), cash-on-cash, **DSCR** (lenders require it),
GRM, expense ratio, occupancy %.

---

## 3. Financing, insurance, key dates

These are date-driven and need portfolio rollups ("everything renewing in 30
days"), so **real columns / a related model**, not JSON.

### Loan

BRRRR = you refinance constantly, so loan history is real. Options:
- **Fast:** flat columns on `Property` — `loanNumber`, `loanOriginalAmount`,
  `loanRate`, `loanPaymentMonthly`, `loanOriginationDate`, **`loanMaturityDate`**,
  `loanEscrow` (bool), `loanType` (DSCR 30yr / Bridge / Portfolio…).
- **Right:** a `Loan` model, many per property, one `isCurrent`. Keeps the refi
  history and lets "current loan" always be a computed pointer.

`loanMaturityDate` / balloon date is load-bearing — miss it and you're in
default.

### Insurance card

You already have this data in the component-age spreadsheet (carrier, deductible,
coverage, liability limits, premium). Add: `insuranceCarrier`,
`insurancePolicyNo`, `insuranceCoverage`, `insuranceDeductible`,
`insuranceLiability` (text, "1M / 2M"), `insurancePremium`,
**`insuranceRenewalDate`**. A lapse = lender force-places + technical default.

### Key dates card + auto-reminders

Derive a list from: loan maturity, insurance renewal, property-tax due dates
(Buffalo: quarterly), **rental registration / C of O renewal** (Buffalo requires
registration + periodic inspection), lead cert. Show soonest few with a countdown.
Then: auto-create a `Task` (due ~30 days prior) for each, idempotently — the
`Task` model + property link already support this.

---

## 4. Property facts

Small card, but `yearBuilt` also feeds better CapEx lifecycle defaults (an 1890s
Buffalo double ≠ a 1960s ranch):

- `yearBuilt`, `parcelId` (SBL), `lotSize`, `zoning`, `stories`, `basement`,
  `heatingType`, `parking`
- Per unit (via §2): beds / baths / sqft

Plus: **one hero photo** (Vercel Blob, same as task attachments). 11 properties,
every page is identical grey text — a photo anchors it. And a "Open in Google
Maps ↗" link from the address (Buffalo neighborhoods matter).

---

## 5. Notes → dated log

Replace the single `notes` textarea with a `PropertyNote` model mirroring
`DealNote` (date, body, source: manual / change / migration). Reuse the deal
page's Activity timeline component. A running dated log ("3/15 rear tenant
reported roof leak", "4/1 quote $8k") beats one blob, and §0's "edits are silent"
gets solved for free (`source: "change"`).

---

## 6. Layout / IA

Keep it **one page** (an operator wants the whole picture in one scan), but:

1. Header + **summary strip** (§1)
2. **Key dates** + **CapEx forecast** headline (the "what's coming" band)
3. **Rent roll** / units
4. **Financials** (snapshot + ratios)
5. **Building CapEx**, **Loan**, **Insurance**, **Property facts** — collapsible
6. **Tasks**, **Notes/Activity**, **Documents**

Make the reference sections (`<details>` accordions, like units already are) so
the page stays scannable as it grows. Only go to tabs if it passes ~10 sections.

---

## Suggested sequencing

| Step | Scope | Why first |
|---|---|---|
| **A** | Fix-its (§0) + Documents/links + summary strip shell | Cheap, high signal, no migration |
| **B** | Loan + Insurance + Key dates cards (flat columns) + auto-reminder tasks | Date-driven risk; you have the data |
| **C** | `Unit` model migration + rent roll UI | Unlocks everything financial; do before more UI leans on units JSON |
| **D** | Monthly financials + ratios | Needs C |
| **E** | Notes → `PropertyNote` log + edit history | Pattern already exists on deals |
| **F** | Photos, map, property facts | Polish |

**Minimum for "V1 done":** A + B + C. That turns the page from a maintenance log
into a property performance view. D–F can follow once you're back from other
parts of the app.
