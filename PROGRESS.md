# Progress Log — Slicing Pie Equity Tracker

A running record of what has actually been built, what works today, and what is
next. Plain language on purpose: this is written to be read by the founder, not
only by a developer.

**Last updated:** 2026-09-30

> Two other documents sit alongside this one, and they answer different
> questions:
> - `slicing-pie-software-requirements-extraction.md` — what the source
>   material (the book/system) says the rules are.
> - `slicing-pie-implementation-plan.md` — the architecture, the audit of what
>   was found, and the reasoning behind each engineering decision.
>
> This file is the *progress* view: what is done, what is usable, what is not.

---

## 1. Status at a glance

| Workstream | State | What that means in practice |
|---|---|---|
| **W1 — Foundations** | ✅ Done | Ledger, appending-only rules, audit trail |
| **W2 — Correctness** | ✅ Done | The maths is verified, including the case where a departing person has already been paid |
| **W3 — Settings console** | ✅ Built, not yet clicked | You can change every rule from the screen — needs one real save to confirm |
| **W4 — Departure & buyout** | ✅ Built, not yet clicked | You can record anyone leaving, after seeing the exact consequence first |
| **W5 — Self-service** | ✅ Done | Your team can log their own time *and* see their own slices — and nobody else's |
| **W6 — Defensibility** | ✅ Done | Every entry is re-checked against the rule that made it, ownership can be shown as of any past date, and the whole history downloads |

**Tests: 474 checks, all passing, across 6 suites.** Run them with `npm test`.

---

## 2. What you can do today

This is the part that matters — the tool as it stands right now.

- **Create a Pie** and set its currency. The default is now **Naira (₦)**.
- **Add participants**, give them a role, and set each person's fair-market
  salary (this is what turns hours into equity at payday).
- **Team members log their own hours** at *My Time*. They see only their own
  time entry — not the Pie, not anyone else's slices. (Decision D1.)
- **Team members see their own slices** at *My Slices*: their slice count,
  their share of the Pie, where the equity came from, what they have put in
  that is still unpaid, and the entries behind the numbers. Still their own
  figures only — the page has no way to be pointed at anyone else.
- **Run payday** — converts logged hours into slices.
- **Record contributions** of all 18 kinds: time, cash expenses, equipment,
  idea royalties, sales commission, facilities, finder's fees, advisor time,
  personal car use, referrals, and payments *out* to a participant.
- **See the live cap table** — who owns what percentage, updated as things are
  logged.
- **Record someone leaving** — pick the person, say what happened, and the tool
  shows you exactly what they keep, exactly what goes back to the Pie, and the
  exact ledger entries that will be added — *before* anything is written.
- **Manage The Well** — the shared pot of cash, with withdrawals split by
  ownership.
- **Change every rule from the Settings screen**, with a dated history of who
  changed what and why.
- **Freeze a Pie** when a Series A happens, locking ownership.
- **Prove the numbers** at *Records & proof* (inside each Pie). Every entry is
  recalculated from the rules frozen onto it, ownership can be shown as it
  stood on any past date, and the whole history downloads as a spreadsheet or
  a complete data file.

---

## 3. Recent changes

### 2026-09-30 — Self-service and defensibility finished (W5, W6), and the manual

Two workstreams and the documentation the product had been missing.

**W5 — My Slices.** Team members could log their own time but could not see
what it had earned them, which makes the ledger they are feeding a black box.
There is now a **My Slices** page showing their slice count, their share of the
Pie, where the equity came from by category, what they have put in that is
still unpaid, their logged/awaiting/converted hours, and the entries behind the
numbers with corrections marked. It is open to everyone, and it is the *only*
view of the Pie they get — the scoping lives in one shared module
(`lib/slicing-pie/server/my-slices.ts`) that both the page and the API call, and
it takes no parameter that widens it, so a member cannot reach another member's
figures by editing a URL. The cap-table endpoint, which had been readable by any
signed-in user, is now admin-only.

**W6 — Records & proof.** D3 promised a history that could be defended and
exported. Three things now exist:

1. **Every entry is re-checked.** Each ledger row is recalculated from the
   inputs stored on that row, using the rules frozen onto it — not today's
   rules, so a settings change never retroactively flags history. Corrections
   and rows rewritten by the old append-only migration are recognised and
   explained rather than reported as faults, because a check that cries wolf is
   worse than no check. Anything that genuinely fails to reproduce is named,
   with both figures.
2. **Ownership as of any past date**, rebuilt from the ledger. Because entries
   are cut off by date, a departure recorded in June cannot change what
   ownership looked like in May — with no special handling, it simply falls the
   right way.
3. **The history downloads** — a CSV for a spreadsheet (with each entry's
   recalculated figure beside the recorded one, and a totals block that matches
   the cap table), and a complete JSON archive of the whole Pie.

The "the ledger cannot be edited" claim is now **checkable rather than
asserted**: a button on that page asks the database to try, and shows its
refusal in the database's own words.

**The manual.** A guide page written for a non-programmer, linked from the
admin's Slicing Pie screen and from the navigation bar: what the system is, what
a team member does, what an administrator does, how the maths works, what each
of the eighteen contribution kinds is for, the four ways someone can leave, and
a section on what to do when a number looks wrong.

**A real bug this caught.** `npx tsc --noEmit` had been reporting "clean" while
genuinely broken code sat in the tree — the incremental build cache
(`tsconfig.tsbuildinfo`) was serving stale results. Clearing it revealed a
mismatch in the brand-new My Slices code (`OwnershipRow` exposes `pct`, not
`percent`) that would have rendered every member's ownership share as 0%, plus
two broken import paths in the export module. The correct command is
`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit`.

The tests went from 398 to 474 checks, across 6 suites.

### 2026-09-30 — A departure can now be recorded for someone already paid (W2 signed off)

This was the last stop sign in the tool. Two separate faults had to be fixed
together, because fixing either one alone would have produced wrong numbers.

**Fault 1: a payment came out of two buckets at once, and the recovery was
judged one row at a time.** A payment row is a single negative number, but the
money it removed came out of cash-type contributions *and* the rest — at
different multipliers. Judged row by row, part of it had nowhere to land, and
the remainder could be allocated as **negative slices** — a negative ownership
percentage. Recovery is now judged **in aggregate**: the payment's drawdown is
replayed and laid on the rows it actually consumed, in proportion to what each
still holds. The payment row itself then accounts for nothing, which is exactly
what makes the two halves cancel.

**Fault 2: the money was being converted to slices at the wrong rate.** This one
could show up *today*, with no departure involved. A payment's slices were
worked out as *money × the multiplier for that bucket* — but a bucket is not one
multiplier. Cash sits at ×4 and equipment at ×2, and both are in the same
bucket. So a participant whose whole at-risk balance was ₦100,000 of equipment
(200,000 slices at ×2) would have a ₦100,000 payment remove 400,000 slices —
**twice what they hold**. The drawdown is now measured against the rows the
money actually draws on, and the figure is frozen onto the payment row, so
nothing has to re-derive it later.

Both fixes are pinned by tests that run the whole chain end to end —
plan the payment → write the ledger row → recover the balance — and assert that
`original rows + corrections = what the person keeps`, on four different
holders: a pure cash balance, a pure tangible balance, a bucket mixing ×4 and
×2, and a balance with a payment already on it.

The tests went from 332 to 398 checks.

### 2026-09-30 — Departure screen built (W4)

The departure rules were fully written and tested, and there was no way to use
them: no button anywhere in the app recorded that someone had left, so the
single biggest ownership event in a Pie could only happen by hand. There is now
a **Departures** section on the Pie dashboard.

Three things it does deliberately:

1. **It previews before it writes.** Recording a departure cannot be undone —
   it adds correcting entries to a ledger that only ever grows. So the screen
   asks the server to *calculate* the outcome first and shows you the numbers
   and the exact ledger rows, with nothing saved. Only then can you confirm.
2. **It spells out the two directions of each reason.** The labels in the rule
   book are read backwards about half the time: *"dismissed — the company had a
   good reason"* makes someone a **bad** leaver, and *"dismissed — the company
   had **no** good reason"* makes them a **good** leaver who keeps everything.
   Both are written out on the screen, with their consequence, because picking
   the wrong one moves a large number of slices the wrong way.
3. **It shows who cannot leave this way, and why.** A capped advisor cannot be
   terminated and a contractor is outside the recovery rules entirely. Those
   people are listed with the rule's own explanation rather than quietly
   omitted.

Anyone the tool will not let you record is judged by *the same code* the server
uses, so the screen can never offer a departure the server would refuse.

### 2026-09-30 — Test suite green for the first time

The project had a test suite that had never once been run, because there was no
supported command to run it. One was added (`npm test`). The first execution
found 8 failures in the departure tests.

**None of them was a fault in the money rules.** Six were stale expectations
that contradicted tests which passed in the same file — they counted only part
of what a departing person loses, leaving 600 slices of a 2,300-slice portfolio
unaccounted for. One was a bug in the test's own helper. One assumed the wrong
royalty policy.

All eight were corrected in the tests, not papered over in the engine, and a
standing check was added so the two numbers can never drift apart again:
**retained + forfeited must always equal exactly what the person held**.

### 2026-09-30 — Settings console built

The settings *API* was already written, audited, and complete — and no screen
anywhere reached it. The rules could only be changed by editing code. There is
now a Settings screen, generated entirely from the rule definitions, so it can
never disagree with the engine that enforces those rules.

### 2026-09-30 — Default currency is Naira

Changed in all five places a currency is decided: the shipped defaults, the
money formatter, the Pie creation form, and the database (new migration
`0007`). Existing Pies still marked "USD" were created by the old default and
are flipped to NGN; the Settings screen can change any of them back.

Also: the currency field is now a **dropdown** rather than a free-text box. A
typo there would create a Pie denominated in a currency that does not exist,
and the rules forbid FX conversion afterwards — so it is not recoverable.

---

## 4. Known issues and stop signs

### 🟡 The Departure screen and the Settings console have never been used

Both are built and typechecked, but no departure has been recorded and no
settings change saved through them — there is no running database in the
development environment. The first real use of each is its acceptance test.

### 🟡 The Operating Currency field is mislabelled in the rule definitions

It says "list" when it is actually a single currency code. The screen handles
it correctly; the definition should be corrected properly.

---

## 5. What's next, in priority order

Everything the product was planned to do is built. What remains is not
building — it is **using it once, for real**, because several screens have been
written and typechecked but never clicked against a live database:

1. **Click through the whole thing once**, in this order: create a Pie → add two
   people with salaries → log hours as one of them → run payday → record a
   contribution of each multiplier kind → record a payment out → record a
   departure → open Records & proof and confirm every entry re-checks. A
   database is needed for this; there is none in the development environment.
2. **Then the two smaller known gaps** listed in section 4.

---

## 6. How to run things

```bash
npm test     # the full rule-engine suite (474 checks, 6 suites)

# Typecheck. Clear the build cache first — see the warning below.
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep -v "^\.next/"

npm run dev  # run the app locally
```

> ⚠️ **`npx tsc --noEmit` alone is not trustworthy in this project.** It is set
> to `incremental`, and a stale `tsconfig.tsbuildinfo` will happily report a
> broken tree as clean. This has already hidden a real bug once. Always delete
> the cache file first, as above.

The 6 suites cover: money formatting and rounding, the config resolver, the
calculation engine, the policy guards, The Well, departures, and the
reconstruction audit / as-of cap table / export. They exit non-zero on any
failure, so they can gate a deployment.
