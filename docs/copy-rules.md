# Copy rules

These rules cover every string a person sees in HG Capital OS, the contractor portal and the public site: labels, buttons, helper text, tooltips, toasts, errors, empty states, emails and public pages. People and agents both follow them. [CLAUDE.md](../CLAUDE.md) carries the short version, and [brand-guidelines.md](brand-guidelines.md), section 8, has the voice with before-and-after pairs.

The aim is copy that reads like someone at a well-run property office wrote it. Cut anything that's filler, sounds AI-written, or doesn't help the reader do something.

## The rules

### 1. Every line gives the user value

If a line, label, chip or tooltip doesn't help the user decide or act, cut it.

- Don't restate what the layout already shows, like tab names, column headers or counts that appear elsewhere.
- Cut subtitles that explain the structure of the page. The structure already explains itself.
- Drop helper text unless it prevents a real mistake.
- A toggle, field or row starts as its label and its control, with no line under it. Lines that explain what the control does or why it showed up ("Adds the lockbox code", "Dana Lee lives here") read as AI filler (Connor, Nov 17, 2026). A spec that keeps one names the mistake it prevents.

### 2. Use the lightest form that works

In order, try:

1. Nothing
2. A count or chip
3. A tooltip
4. One short line

Never a paragraph.

### 3. One line

Notices, helper text and sublabels don't wrap at the component's normal width. Shorten the words, not the font.

### 4. No em dashes

Em dashes read as AI-written. Don't fix one by swapping in a period, comma or colon. A dash usually means the sentence is doing two jobs, so rewrite it until it doesn't need one. If you can't tell what the copy should say, ask Connor instead of patching the punctuation.

Quoted speech and scripts can keep their natural phrasing, but still without the dash. A lone "—" standing in for an empty value is fine, since it's a glyph and not a sentence.

### 5. No filler

- No "simply", "easily", "Note that…", "This lets you…".
- No SaaS hype: "seamless", "effortless", "unlock", "supercharge", "empower".
- Don't repeat the heading in the body.

### 6. Warm words, no theater

- Sound personal and plain ("Hi Dana, here's what's due this week."). The name comes from the signed-in user or the record, never a hard-coded one.
- No exclamation points, except the thank-you heading on a sent or confirmation screen ("Thanks, Dana!").
- Don't promise outcomes or timelines you can't back up.
- No emojis in product copy.

### 7. Messages say what happened and what to do next

This covers toasts, errors, validation, confirmations and empty states.

- Write in plain English for a 6th to 8th grade reader.
- Say what happened and what to do next: "Couldn't save. Try again or reload the page."
- Keep toasts under about 90 characters.
- Never use "Something went wrong", "An error occurred", "Request failed" or "Oh no".
- Don't blame the user. Say what's needed: "Enter a full email, like name@example.com."

The shared lines live in `src/lib/action-result.ts` (`GENERIC_ERROR`, `OFFLINE_ERROR`, `NUMBER_TOO_BIG`). Reuse one before writing a new one.

### 8. Internal caveats stay out of the UI

Notes like "not enforced yet" or "prototype only" go in code comments or docs, never on screen.

## Every size

Copy has to work at every width, not just desktop.

- **Design for three sizes from the start:** laptop 1280x800, tablet 768x1024 (the touch layout) and mobile 375x667.
- **Mobile can say less.** Hide secondary info or use shorter copy on small screens, for example a word that only shows at large widths (`hidden lg:inline`). Don't cram or wrap.
- **One-line copy stays on one line** at every width we support. If it wraps on a phone, shorten it or give it a mobile variant.
- **Rows of controls never wrap**, at any width from 320 to 1920. Shorten the labels or collapse them into a Filters button.
- **Check every state, not just the default page.** `npm run test:devices` only loads each route's default state. Open each dialog, menu, toast, empty state and error state you touched at 375 and 320 yourself.
- **Touch has no hover.** Anything a tooltip carries still needs a tap on touch.

## Review checklist

Run each string through these questions before it ships:

- [ ] Does this help the user decide or act? If not, cut it.
- [ ] Does the layout already say this? If so, cut it.
- [ ] Could a lighter form work: nothing, a chip, a tooltip?
- [ ] Is there a line under a control explaining it? Cut it unless it prevents a real mistake.
- [ ] Does it fit on one line at desktop, tablet and 375 / 320?
- [ ] Any em dashes? Rewrite the sentence, don't swap the punctuation.
- [ ] Any filler or hype words?
- [ ] Does it repeat the heading?
- [ ] Any exclamation point outside a thank-you heading?
- [ ] Does it promise something we can't back up?
- [ ] For errors and toasts: does it say what happened and what to do next?

## What lint checks

`npm run lint` catches the mechanical parts in string literals, template strings and JSX text under `src/` (`eslint.config.mjs`). Comments and tests aren't checked. Judgment still has to catch the rest.

| Rule | Level | Catches |
|---|---|---|
| `no-restricted-syntax` | Error | Em dashes, except a lone "—" for an empty value |
| `hg/vague-copy` | Error | "Something went wrong", "An error occurred", "An unexpected error", "Request failed", "Operation failed", "Oh no" |
| `hg/filler-copy` | Warning | simply, easily, seamless, effortless, note that, this lets you, unlock, supercharge, empower |

Warnings are for reading case by case, not hard failures. "Unlock" on a lockbox step can be fine, and so can "a note that only partners see". A string that has to keep a flagged phrase, like a log line quoting a vendor's error, takes an `eslint-disable-next-line` comment saying why.
