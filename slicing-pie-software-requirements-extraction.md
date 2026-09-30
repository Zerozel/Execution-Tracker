# Slicing Pie — Software Requirements Extraction

**Source document:** *The Slicing Pie Handbook: Perfectly Fair Equity Splits for Bootstrapped Startups*, Mike Moyer (2016), ISBN 978-0692584620 — provided PDF, 152 pages, 15 chapters + Appendix + Index.

**Purpose of this document:** Faithful, traceable extraction of the Slicing Pie methodology as described in the source book, structured for later conversion into a C-Transit software requirements specification. This document does **not** decide what C-Transit will build. Per instructions, ambiguities, conflicts, and gaps are preserved rather than resolved.

**Source-reference convention:** The supplied PDF has no printed page numbers in the extracted text layer (front matter is un-paginated; body chapters are identified by Chapter heading only, not folio number). Where the book's own Index (back matter) cites a page number for a topic, that page number is reported as `Index p.N` — but note the Index page numbers refer to the **original print edition**, not this PDF's internal page count, and could not be independently verified against the PDF's rendered pages. All other citations are given as **Chapter name** (and, for the Legal Issues chapter's contract-language block, as "Legal Issues — Terms for Allocation/Recovery"). Where no more specific location could be established, this is stated explicitly.

---

## 1. Executive Domain Summary

Slicing Pie is a **dynamic equity/profit-sharing allocation methodology** for pre-breakeven, bootstrapped startups (Chapter 3, "Slicing Pie is for Bootstrappers"). Its central principle (the "Slicing Pie Principle," Chapter 3):

> % share of the reward = % share of what's at risk

Two components make up the model (Chapter 1, "Get Them Gators!"):
1. **Allocation Framework** — converts each participant's at-risk contributions (time, cash, equipment, ideas, relationships, etc.) into a dimensionless unit called a **"slice"**, using fair-market-value (FMV) calculations and a **multiplier** (cash vs. non-cash). Ownership at any moment = an individual's slices ÷ total slices in the Pie.
2. **Recovery Framework** — governs what happens to a participant's slices when they separate from the company, based on **why** they left (four departure categories) and **what kind** of contribution the slices represent (intangible vs. cash/tangible).

The model is used **only** before "breakeven" (revenue ≥ expenses) or a priced "Series A" financing event (Chapter 3, Chapter 8). At that point the Pie **freezes** — it stops accepting new at-risk contributions and becomes, in effect, a fixed split for purposes of distributing future profits or sale proceeds.

The book is explicit that it is **not a legal document** and not tax/legal advice (front-matter disclaimer; Chapter 10). It describes a **moral/operational methodology**, and separately describes (Chapter 10) how that methodology is typically translated into legal contract language and a commercial software product ("The Pie Slicer," Chapter 15) that the author's company sells. The Pie Slicer's own calculation table (Chapter 15) is treated in this extraction as **source material describing the reference implementation**, since the book explicitly states the Pie Slicer implements "the rules and logic ... exactly as described in this book."

---

## 2. Core Concepts

| Concept | Definition (source) | Purpose | How Calculated | Depends On / Feeds | Changes Over Time? |
|---|---|---|---|---|---|
| **Pie** | The whole of a company's slice-based ownership/profit-sharing pool (implied throughout; formalized via "Pie Slicer" tooling, Ch. 15). | Represents 100% of at-risk-based ownership. | Sum of all participants' slices at a point in time. | Sum of all contributions. | Yes, until frozen (Ch. 8). |
| **Slice** | "A fictional unit used to represent the adjusted fair market value of an at-risk contribution. A slice does not represent equity shares, nor does it have any actual value; it just helps us calculate the right percentages." (Ch. 3) Note: called "Theoretical Value" in *Slicing Pie* v2.3 and earlier (Ch. 3 note; Appendix). | Convert heterogeneous contribution types into one comparable unit. | `Slices = Fair Market Value × Multiplier (Cash or Non-Cash)` (Ch. 4 Summary). | FMV, Multiplier. | Accumulates with each contribution; can be removed on buyout/recovery. |
| **Participant** | Not formally defined as a single term; the book uses "individual," "employee," "founder," "partner," "advisor," "contractor," "investor" interchangeably depending on context (Ch. 7 explicitly notes it will "refer to the person being separated as an employee" for simplicity, covering "founder, partner, employee, or anything else"). | Any person who contributes at-risk value to the company. | N/A | — | Status can change (e.g., contractor → employee, Ch. 6 "Contractor Time"). |
| **Contribution** | An input of time, cash, ideas, relationships, equipment, supplies, or facilities made by a participant "at risk" (not paid FMV) (Ch. 3, Ch. 4). | The raw event that generates slices. | Type-specific (see Section 4). | FMV, Multiplier. | Recorded per event; historical entries are not retroactively changed by later settings edits (Ch. 15, "Team Member Settings": "the change will only affect future calculations; it will not go back in time and change past contributions. This is true for all changes made to settings"). |
| **At-risk contribution** | The portion of a contribution's FMV that is **not** paid in cash — i.e., what the participant is "betting" (Ch. 1, "Blackjack" analogy; Ch. 3). | Basis for slice calculation. | `At-Risk Value = FMV − Cash Paid` (implied; explicit for time in Ch. 6: "you subtract cash payments, if any, because cash payments reduce the amount of risk taken"). | FMV, actual payments made. | Decreases as company pays more cash toward FMV. |
| **Fair Market Value (FMV)** | "The amount of money that the contributor would have been paid by someone else for the same contribution in a given market" (Ch. 3 Summary). | Objective, observable substitute for unknowable future value. | Type-specific (salary÷2000 for time; cash spent for expenses; purchase/resale price for equipment; royalty rate × revenue for ideas; etc.) — see Section 4/5. | Market comparables. | Set at time of contribution; can be renegotiated going forward (not retroactively) via settings changes. |
| **Cash contribution** | "A contribution that consumes an individual participant's actual cash, usually in the form of an unreimbursed expense or cash expenditure from the company account. A cash contribution can also be tangible property with cash value like equipment or supplies" (Ch. 5). | Distinguishes higher-risk (post-tax, scarce) contributions. | Uses **Cash Multiplier**. | FMV of cash spent. | Recognized "when the cash gets spent," not when committed (Ch. 5). |
| **Non-cash contribution** | "Pretty much anything an individual contributes without an outlay of cash" — e.g., time, introductions/relationships, pre-owned equipment (Ch. 6). | Distinguishes lower-risk-premium (pre-tax, more abundant) contributions. | Uses **Non-Cash Multiplier**. | FMV of the non-cash input. | Recognized as work/use occurs. |
| **Multiplier(s)** ("normalizers") | A "risk multiplier that normalizes cash and non-cash contributions and imposes consequences on the at-fault party in the event of a person's separation from the company" (Ch. 3). Recommended: Cash = 4×, Non-Cash = 2× (Ch. 4). | (a) Reward risk-taking, (b) normalize cash vs. non-cash (tax/scarcity), (c) create separation-related consequences via the Recovery Framework. | Fixed constants applied multiplicatively to FMV. | — | Author recommends keeping **constant** ("floating multipliers" explicitly rejected, Ch. 4); configurable in the Pie Slicer/spreadsheet if a team chooses to override, but changes apply only prospectively. |
| **Ownership percentage** | Individual's proportional claim on rewards. | Determines profit/sale-proceeds distribution. | `Ownership % = Individual's Slices ÷ Total Slices in the Pie` (Ch. 1 formula box; Ch. 4; restated in Legal Issues "Terms for Allocation": "Individual's slices ÷ all slices"). | Total slices, individual slices. | Recalculates continuously ("on a rolling basis," Ch. 4) until frozen. |
| **Company** | Not separately defined; implicit legal entity holding the Pie (LLC or C-Corp discussed, Ch. 10). | — | — | — | — |
| **The Well** | "A pool of funds from which managers can make payments" — a company savings account funded by cash contributions that has **not yet** been spent (Ch. 5). | Lets the company hold cash without prematurely converting it to slices. | N/A (a balance, not a formula) — money in the Well does not generate slices until withdrawn/spent. | Deposits from founders/friends/family/small angels. | Balance changes with deposits/withdrawals; ownership of Well balance itself is proportional to each contributor's deposits (Ch. 5 example). |
| **Recovery** | The Recovery Framework's process of adjusting/removing a departed participant's slices (Ch. 7). | Prevent "absentee owners"/"dead equity." | Type- and departure-reason-specific — see Section 14. | Departure reason, contribution type. | Triggered at separation event. |
| **Buyout** | Company (or, in "on-the-job" case, an active participant) purchasing back outstanding slices for cash, "an amount of cash equal to the outstanding slices" at a per-slice currency rate (recommended $1/slice in the US) (Ch. 7). | Convert dead/at-risk equity back into settled cash, avoid absentee owners. | `Buyout Price = Outstanding Slices × Currency Rate per Slice` (Ch. 7). | Slice count, currency rate, departure-reason-dependent right to force. | One-time event per buyout transaction; can also happen "on-the-job" for a still-active participant (Ch. 7). |
| **Breakeven** | The point where "revenue exceeds expenses" — participants start getting reimbursed/paid and new contributions are no longer at-risk (Ch. 3, breakeven graph discussion). | Marks the boundary of Slicing Pie's applicability. | Revenue − Expenses ≥ 0 (implied by "income = revenue – expenses" graph description, Ch. 3). | Company financials. | One-time transition (per Pie); after this, the Pie will "freeze" if all needs are met by cash (Ch. 8). |
| **Funding events** | Angel investment (partial funding, via Well/convertible note/SAFE) vs. **Series A** (funding that "will meet the cash needs of the company in the foreseeable future") (Ch. 8, "Series A Investment"; Ch. 9). | Series A is defined as a Pie-freezing event distinct from ordinary cash contributions. | No formula; qualitative test ("a substantial amount of money... that will meet the cash needs of the company in the foreseeable future" vs. angel money that covers "a part, but not all"). **AMBIGUOUS — REQUIRES HUMAN DECISION** on the precise numeric/qualitative threshold — the book does not define one. | — | One-time trigger event. |
| **Pie freeze** | The state where "the model will no longer allocate slices for contributions and the model will stop changing" (Ch. 8). Attorneys may call this "termination" (Ch. 8). | Converts the dynamic model into a static/fixed split for future profit/sale distributions. | Triggered when (a) company pays 100% of FMV for all ongoing contributions (organic breakeven), or (b) Series A investment closes (Ch. 8). | Breakeven state or Series A event. | One-directional in the text as described — see Section 17 for restart ambiguity. |

---

## 3. Configuration Variables

| ID | Name | Meaning | Default (source-stated) | Unit | Fixed or Configurable? | Conditions of Change | Source |
|---|---|---|---|---|---|---|---|
| CONFIG-001 | Non-Cash Multiplier | Multiplier applied to FMV of non-cash contributions | **2 (2×)** | multiplier (unitless) | Configurable in Pie Slicer ("Non-Cash Multiplier... default setting is 2. I don't recommend changing this," Ch. 15 Pie Settings table), but author strongly discourages changing it (Ch. 4, "Resist the urge to change them!"). Changes apply to future contributions only, not retroactive (Ch. 4, Ch. 15). | User-initiated in Pie Settings | Ch. 4 "Multipliers/Normalizers"; Ch. 15 "Pie Settings" |
| CONFIG-002 | Cash Multiplier | Multiplier applied to FMV of cash contributions | **4 (4×)** | multiplier (unitless) | Configurable, same caveats as CONFIG-001. Book recommends "your cash multiplier is more than your non-cash multiplier and that your non-cash multiplier is higher than one" if changed. | User-initiated | Ch. 4; Ch. 15 |
| CONFIG-003 | Working Hours Per Year | Divisor used to convert annual FMV salary to hourly rate | **2,000** (40 hrs/week × 50 weeks) | hours/year | **POTENTIAL CONFLICT — REQUIRES REVIEW.** In Ch. 15 "Team Member Settings" the book states the Pie Slicer "will automatically convert the salary to an hourly rate by dividing by 2,000" with no mention of user configurability there. But in Ch. 11 (Retrofit tool) it states "The spreadsheet will determine an hourly rate based on the number of hours in the settings area. The default is 2,000... Some countries have different hours in a working week" — implying it IS configurable in that tool. The two tools (Pie Slicer vs. Retrofit spreadsheet) are described inconsistently on this point. | Per Retrofit tool: user-initiated | Ch. 6 "Time"; Ch. 11 "Fair Market Salary"; Ch. 15 "Team Member Settings" |
| CONFIG-004 | Commission Rate | % of revenue paid (in slices) to salesperson responsible for a sale | **10%** (Pie Slicer default); book text separately says "5%–10% is typical" | percent of revenue | Configurable ("Commission Rate... set under Pie Settings options," Ch. 6; Ch. 15 table) | User-initiated; "make sure you pay the same commission rate to all salespeople" (Ch. 6) | Ch. 6 "Customers"; Ch. 15 "Pie Settings" |
| CONFIG-005 | Royalty Rate | % of revenue attributable to an idea, paid in slices to the idea's originator | **5%** (Pie Slicer default) | percent of revenue | Configurable ("Set the Royalty Rate under the Pie Settings menu," Ch. 6; Ch. 15 table) | User-initiated | Ch. 6 "Ideas"; Ch. 15 |
| CONFIG-006 | Finder's Fee (Investment) | Fee schedule paid (in slices) to whoever secures an investment | Recommended: **5% of first $1,000,000, 2.5% of the rest** (Ch. 6). Retrofit spreadsheet simplifies to a **single tier** for raises under $1,000,000 (Ch. 11: "There is only one Investor Finder's Fee level which is set to the recommended rate for fund raises under $1,000,000... reasoning that companies who have raised more than $1,000,000 may not need the Slicing Pie model."). | percent, tiered by amount raised | Configurable — two cutoff/rate fields in the Pie Slicer ("you can set two rates. One for the first X amount of cash, and one for the rest," Ch. 15) | User-initiated | Ch. 6 "Investors"; Ch. 11 "Pie Settings"; Ch. 15 "Pie Settings" |
| CONFIG-007 | Currency | The company's operating currency; used at 1:1 basis to convert slices to buyout cash amounts | Not defaulted in text (user's local currency) | currency code | Configurable ("Use the primary currency that your company operates under," Ch. 15). Explicitly: "The Pie Slicer will not consider exchange rates." | User-initiated | Ch. 15 "Pie Settings" |
| CONFIG-008 | Personal Car Calculation Method | Choice of method for splitting personal-car reimbursement into cash/non-cash portions | Two named methods (see TIME/CAR rules, Section 6); no stated default | enum (Method 1 / Method 2) | Configurable ("You can set the Personal Car calculation method and rate in the Settings Menu," Ch. 5) | User-initiated | Ch. 5 "Personal Car"; Ch. 15 |
| CONFIG-009 | Personal Car Mileage Rate | Per-mile/km reimbursement rate used in Method 2 | Referenced example: US IRS rate "around $0.54 per mile" (as of book's writing) — **explicitly described as an example, not a universal constant** | currency/mile or /km | Configurable | Jurisdiction- and time-dependent (IRS rate changes annually — book flags this as "as of this writing") | Ch. 5 "Personal Car" |
| CONFIG-010 | Advisor Hourly Slice Cap | Recommended cap on advisor hourly compensation, expressed directly in slices/hour | **200 slices/hour** (recommended) | slices/hour | **AMBIGUOUS — REQUIRES HUMAN DECISION.** Stated as "I recommend capping..." — no explicit statement that this is user-configurable in the Pie Slicer (not listed among the enumerated Pie Settings fields in Ch. 15), unlike CONFIG-001–006 which are explicitly called out as adjustable. | Unclear | Ch. 7 "Advisory Board Members" |
| CONFIG-011 | Advisor Minimum Hours Threshold | Minimum hours an advisor must contribute "before cutting them in" | **10 hours** (recommended) | hours | **INCOMPLETE SPECIFICATION** — mechanism unclear (see Section 24, Ambiguity list item on advisors) | Unclear | Ch. 7 "Advisory Board Members" |
| CONFIG-012 | Contractor Buyout Cap / Window | Ceiling and time-limit on a company's right to force-buyout a contractor's slices | Buyout price rises to **200% of the base billed price** by end of year 1; the **buyout right expires** after 1 year ("After that, the buyout option goes away for any billings more than a year old") | percent of base price; time window (1 year) | Not stated as user-configurable — presented as a fixed recommended schedule | — | Ch. 6 "Contractor Time" |
| CONFIG-013 | Loyal-Employee Threshold (time-based) | Number of months of slices retained if an employee resigns for no good reason but is treated as "loyal" | **Blank / user-set** — book explicitly leaves this as a fill-in: "Slices contributed before _____ months..." (Legal Issues — Terms for Recovery) | months | Explicitly configurable per-company; **no default given anywhere in the book** | Company/legal-document decision | Ch. 7 "Loyal Employees"; Legal Issues — "Terms for Recovery" |
| CONFIG-014 | Loyal-Employee Threshold (percentage-based) | Alternative: % of slices retained instead of a month cutoff | **Blank / user-set** — "buyout at a price equal to _____% times the number of slices..." | percent | Explicitly configurable; no default given | Company/legal-document decision | Legal Issues — "Terms for Recovery" |
| CONFIG-015 | Employee Referral Fee | Flat fee (in slices, via non-cash multiplier) paid for a relationship that results in a new hire | **$250–$500** (recommended starting range, not a single default) | currency | Not explicitly stated as a UI setting — logged via the "Other" contribution type per instance (Ch. 6) | Company decision | Ch. 6 "Employees" |
| CONFIG-016 | Referral Fee Waiting Period | Delay before referral-fee slices are granted, to confirm new hire retention | **≥6 months** (recommended) | months | Not stated as a UI setting | Company decision | Ch. 6 "Employees" |
| CONFIG-017 | Relocation "Good Reason" Distance Threshold | Distance a company relocation must exceed to trigger "resignation for good reason" | **50 miles** from original location | miles | Presented as a fixed recommended rule, not flagged as a UI setting | — | Ch. 7 "Resign for Good Reason" |
| CONFIG-018 | Claw-Back Window | Time window after a below-market buyout during which a subsequent higher-value transaction triggers a claw-back payment | **1 year** | time (1 year) | Not stated as configurable | — | Ch. 7 "Claw Back" |
| CONFIG-019 | Non-Solicitation Period | Duration a departed employee is barred from recruiting former co-workers | **"usually one year"** | time (~1 year) | Described as customary/typical, not a hard rule or a UI setting | — | Ch. 7 "Fired for No Good Reason" |
| CONFIG-020 | Partner/Vendor Savings Allocation Rate | Share of measurable cost savings allocated (in slices) to whoever sourced a partner/vendor that produced savings | **"under 5%"** | percent of savings | Not stated as a UI setting; described as author's personal preference ("I prefer not to provide slices... but it's up to you!") | Company decision | Ch. 6 "Partners & Vendors" |
| CONFIG-021 | Buyout Currency Rate ("price per slice") | Rate used to convert outstanding slices into a cash buyout amount | Recommended **$1/slice** (US example) | currency/slice | Same field as CONFIG-007 (Currency) — the buyout conversion is explicitly 1:1 in whatever currency is configured. Author notes: "the company can certainly offer more or less than that. The employee can take it or leave it." | Company decision at time of offer (for voluntary offers); fixed 1:1 for forced buybacks | Ch. 7 "Buyout Price"; Ch. 15 "Currency" |

---

## 4. Contribution Types

### 4.1 Time (Employee / Founder / Executive)
- **Purpose:** Compensate unpaid/underpaid work at FMV.
- **Who can make it:** Any active participant with a set fair market salary (Pie owner sets this; Ch. 15).
- **Required inputs:** Fair market annual salary; hours worked (per period).
- **Optional inputs:** Notes/description of work done; project/category tag (Ch. 15 "Logging Contributions").
- **Preconditions:** A fair-market salary must be negotiated and agreed for the role (Ch. 6, "Time").
- **Valuation method:** Annual FMV salary ÷ Working Hours Per Year (CONFIG-003) = hourly rate; hourly rate × hours worked = FMV of the period's time contribution, **minus any cash actually paid** for that time.
- **Formula:** `Slices = ((Fair Market Salary ÷ 2000) × Hours) × Non-Cash Multiplier` (Ch. 15 calculation table).
- **Multiplier:** Non-Cash (2×).
- **Resulting slices:** Per period logged (recommended daily/weekly logging, Ch. 3).
- **Timing:** Recognized as hours are worked/logged.
- **Limits/caps:** None for ordinary employees (contrast with Advisor cap, Section 4.3). Overtime pay/eligibility "will apply the formula to these payments as well" if the participant's role is overtime-eligible (Ch. 6 "Overtime") — **INCOMPLETE SPECIFICATION**: no separate overtime rate formula is given beyond applying the standard formula.
- **Exceptions:** If the company pays 100% of FMV salary in cash, zero slices are contributed for that time (Ch. 6). Extra hours beyond a standard week are automatically rewarded because the model is hourly-rate based (Ch. 6 "Built-In Incentives") — but **only for the at-risk (unpaid) portion** of salary; the paid portion "does not reward extra work in the same way."
- **Supporting evidence:** Time logs / hour tracking with notes (Ch. 6, Ch. 15).
- **Related rules:** TIME-001 (formula), CASH treatment of partial salary payments (Ch. 6 "Raises and Bonus Payments" — reducing the Pie Slicer salary field by the annualized paid amount, prospectively only).
- **Ambiguities:** "Overtime" formula not separately specified (see above) — **INCOMPLETE SPECIFICATION**.
- **Source:** Chapter 6 "Time," "Built-In Incentives," "Overtime."

### 4.2 Time (Contractor / Freelancer)
- **Purpose:** Compensate contractors at contract (hourly-billed) rates rather than annualized salary.
- **Who can make it:** Non-employee, non-founder, non-partner, non-advisor "long-term participant" engaged for specific projects (Ch. 6).
- **Required inputs:** Hourly billed rate; hours.
- **Preconditions:** Contractor agrees to a buyout arrangement (not all will) (Ch. 6).
- **Valuation method:** `FMV of Time = Hours × Rate` (contract rate, not annualized-salary rate).
- **Formula:** Same slice conversion as ordinary time (`FMV × Non-Cash Multiplier`), entered by "annualizing the hourly rate, which is Hourly Rate × 2,000" (Ch. 6, Pie Slicer note).
- **Multiplier:** Non-Cash (2×).
- **Resulting slices:** Added to the Pie same as employee time.
- **Timing:** As billed/logged.
- **Limits/caps:** Buyout right — see CONFIG-012.
- **Exceptions:** Unlike ordinary employees, a contractor's accrued slices are subject to a **company-forced buyout right** at up to 200% of base billed value, within 1 year (CONFIG-012); after that year, "the buyout option goes away." Once the buyout window has closed, "the termination rules would not apply" to a contractor at all (Ch. 7 "Contractors") — i.e., ordinary Recovery Framework departure categories do not apply to contractors.
- **Supporting evidence:** Invoices/time logs.
- **Related rules:** CONFIG-012; RECOVERY exemption for contractors (Section 14.6).
- **Ambiguities:** Whether a contractor can transition mid-engagement into "employee" status (and how in-progress contractor slices are treated at that transition) is **INCOMPLETE SPECIFICATION** — the book only says "it would be better to negotiate a fair market salary and include them as an employee" if the engagement extends, without describing the mechanics of a status change.
- **Source:** Chapter 6 "Contractor Time"; Chapter 7 "Contractors."

### 4.3 Time (Advisor)
- **Purpose:** Compensate advisory input while limiting cost/slice exposure given advisors' typically high market rates.
- **Who can make it:** Designated "Advisor" role (Ch. 15 "User Roles").
- **Required inputs:** Hours of advisory time.
- **Preconditions:** Minimum 10 hours contributed "before cutting them in" (CONFIG-011) — **INCOMPLETE SPECIFICATION** on exact mechanism (see Section 24).
- **Valuation method:** Hourly rate capped at 200 slices/hour (CONFIG-010) rather than an uncapped FMV salary rate — OR, if the advisor declines the cap, "a rate that more accurately reflects their market rate" (uncapped).
- **Formula:** Same general `FMV × Non-Cash Multiplier` structure, with FMV/hour effectively capped at CONFIG-010 if the advisor opts into the capped arrangement.
- **Multiplier:** Non-Cash (2×) (implied — no separate advisor multiplier stated).
- **Resulting slices:** Accrue per hour of advisory engagement; "you would simply stop going to them for advice and they would simply stop earning slices" if the relationship lapses (no formal termination event needed).
- **Timing:** As advisory hours occur.
- **Limits/caps:** 200 slices/hour cap (CONFIG-010) if the advisor accepts the capped option.
- **Exceptions / special protections:** If the advisor accepted the capped-hourly option, they are **immune to termination** ("there is rarely such thing as termination for cause" for an advisor who took the cap) — "the Pie Slicer will not allow you to terminate an advisor" (Ch. 7, Ch. 15 note). If the advisor **declines** the slice cap and instead takes an uncapped market rate, they **forfeit** this termination-immunity. If the advisor themselves states they no longer wish to work with the company, this is treated as "resignation for no good reason" and their slices become recoverable under the standard Recovery Framework (Ch. 7 "Advisory Board Members").
- **Supporting evidence:** Advisory hour logs.
- **Related rules:** Recovery Framework exemption for advisors (Section 14.6).
- **Ambiguities:** How the "at least ten hours" precondition interacts with slice accrual (do the first 10 hours accrue no slices, or are slices simply withheld/unlocked until 10 hours are reached?) is **AMBIGUOUS — REQUIRES HUMAN DECISION**.
- **Source:** Chapter 7 "Advisory Board Members"; Chapter 15 "User Roles."

### 4.4 Cash — Unreimbursed Expenses
- **Purpose:** Reward participants who pay company expenses out of pocket without reimbursement.
- **Who can make it:** Any participant.
- **Required inputs:** Amount paid; amount (if any) reimbursed.
- **Preconditions:** Expense must be a legitimate business expense; **customary-reimbursement test** applies — "if it's not customary to cover an expense for employees in your country or local market, you don't have to provide Pie" (explicitly excludes ordinary commuting expenses and personal meals, Ch. 5 "Unreimbursed Expenses").
- **Valuation method:** `FMV = Amount Paid − Amount Reimbursed`.
- **Formula:** `Slices = (Amount Paid − Reimbursed) × Cash Multiplier` (Ch. 15 table; consistent with Ch. 5).
- **Multiplier:** Cash (4×).
- **Resulting slices:** Per expense event.
- **Timing:** Recognized "when the cash gets spent."
- **Limits/caps:** None stated, other than the customary-expense test.
- **Exceptions:** Commuting expenses and personal (non-business) expenses explicitly excluded.
- **Supporting evidence:** Receipts ("Employees and other contributors should keep track of expenses and save receipts").
- **Related rules:** Well/CASH-002 for loans/credit; CAR-001 for personal-car use.
- **Source:** Chapter 5 "Unreimbursed Expenses."

### 4.5 Cash — Well Deposits and Withdrawals
- **Purpose:** Provide a mechanism to hold pooled cash without prematurely generating slices, and to allocate slices fairly among Well contributors when funds are actually spent.
- **Who can make it:** "Founders, friends, family, and small angel investors" (Ch. 5).
- **Required inputs:** Deposit amount, depositor identity; withdrawal amount.
- **Preconditions:** None stated for deposit; for withdrawal, funds must be present in the Well.
- **Valuation method:** **Deposits generate zero slices.** Slices are generated only on **withdrawal/spend**, and are allocated across Well contributors "in proportion to their current ownership of the Well money" at the moment of withdrawal (not at deposit time) — explicitly reiterated in Ch. 15: "Slices are allocated to individuals based on their ownership of the Well at the time the money was withdrawn, not when it's deposited."
- **Formula:** For each withdrawal, `Slices_i = (Withdrawal Amount × Contributor_i's % Ownership of Well) × Cash Multiplier`, for each contributor `i` with a stake in the Well.
- **Multiplier:** Cash (4×).
- **Resulting slices:** Distributed across all current Well owners proportionally, per withdrawal event.
- **Timing:** At time of withdrawal/spend, not deposit.
- **Limits/caps:** "If the Well balance reaches zero, all slices will have been allocated for that 'round'" (Ch. 5).
- **Exceptions:** None stated for ordinary deposits; a Finder's Fee may be owed to whichever team member secured a given cash investment into the Well (see FINDER-001, Section 4.9) — "Only one fee per investment is allowed."
- **Supporting evidence:** Well ledger (deposits, withdrawals, running ownership %).
- **Related rules:** FINDER-001; CASH-002 (loans).
- **Source:** Chapter 5 "The Well," worked example (Julie/Chuck/Anne/Suzanne); Chapter 15 "The Well."

### 4.6 Cash — Personal Loans / Credit Cards Used on Company's Behalf
- **Purpose:** Handle cases where an individual extends personal credit for company use.
- **Who can make it:** Any participant with personal credit capacity.
- **Required inputs:** Loan/credit amount; identity of who is making the loan **payments** (critical variable — not who took out the loan).
- **Preconditions:** None stated explicitly beyond the loan existing.
- **Valuation method:** Depends entirely on **who makes the repayments**:
  - If the **individual** who secured the credit is personally making the payments → treated as cash at time money is spent (or, if a lump sum for general purposes, added to the Well and slices allocated on withdrawal).
  - If the **company** is making the payments (even though the credit is in the individual's name) → the **individual receives zero slices**, regardless of whose name/credit secured the loan. "Slicing Pie doesn't care where the money comes from" (Ch. 9) — only who bears the ongoing risk of repayment.
  - If a payment is **missed** by the company on a loan, "the unpaid portion of the payment will convert to four slices per dollar for the person who is paying the loan, or the person who made the loan but isn't getting payment. Each missed payment converts to slices." (Ch. 9 "Personal Loans")
- **Formula:** `Slices = Amount Personally Repaid (or Missed-Payment Amount) × Cash Multiplier (4×)`.
- **Multiplier:** Cash (4×) always for this category (no non-cash variant described).
- **Resulting slices:** Event-driven, tied to actual repayment or missed-payment events, not to the original loan disbursement.
- **Timing:** At each qualifying payment/missed-payment event.
- **Exceptions:** No slices at all if the company is servicing the debt without interruption — explicitly stated as not "unfair" despite the individual bearing legal/credit risk: "Yes, the individual is taking risk for securing the loan with personal credit, but because they aren't personally making the payments, they don't receive any slices." Rationale given: avoiding double-counting (lender and payer would otherwise both receive slices for the same money).
- **Related rules:** Bank Loans/Credit Cards (Ch. 9) follow the identical logic; secured bank loans "are treated the same as personal loans."
- **Source:** Chapter 5 "Loans and Credit Cards"; Chapter 9 "Personal Loans," "Bank Loans/Credit Cards."

### 4.7 Cash / Non-Cash — Equipment and Supplies
- **Purpose:** Reward contribution of tangible business assets.
- **Who can make it:** Any participant.
- **Required inputs:** Price paid (if purchased for company) OR fair market resale value (if pre-owned); age of the item; amount reimbursed (if any).
- **Preconditions:** Item becomes company property once slices are issued for it — "the supplies and equipment become the property of the company," meaning a departing contributor "can't take the stuff with them" (Ch. 5). Small/insignificant personal items (e.g., "a tape dispenser and some old pens," personal laptops/cellphones) are explicitly excluded — "use your best judgment."
- **Valuation method / Formula (three cases):**
  1. **New** (purchased specifically for the company, not reimbursed): `Slices = (Amount Paid − Reimbursed) × Cash Multiplier`.
  2. **Pre-owned, less than 1 year old:** `Slices = (Amount Paid − Reimbursed) × Non-Cash Multiplier` (uses **original purchase price**).
  3. **Pre-owned, more than 1 year old:** `Slices = (Fair Market/Resale Value − Reimbursed) × Non-Cash Multiplier` (uses **current resale value**, e.g., via eBay/Craigslist comparables).
- **Multiplier:** Cash (4×) for newly-purchased-for-company items; Non-Cash (2×) for pre-owned contributed items (either age band).
- **Resulting slices:** Per item/purchase event.
- **Timing:** At time of purchase or contribution.
- **Limits/caps:** Judgment-based de minimis exclusion (no numeric threshold given) — **AMBIGUOUS — REQUIRES HUMAN DECISION** on where the line sits.
- **Exceptions:** Personal laptops/cellphones typically **not** treated as contributed equipment (no slices, and the company does not gain ownership — departing employees keep them).
- **Recovery treatment note:** Per the book's Appendix (updated position vs. the original *Slicing Pie* book), on a "bad leaver" departure, equipment/supplies slices are **recalculated without the multiplier but retained at cash value** (not zeroed) — see Section 14.
- **Source:** Chapter 5 "Supplies & Equipment"; Chapter 15 calculation table; Appendix "Pre-Owned Supplies and Equipment."

### 4.8 Ideas / Intellectual Property (Royalty Model)
- **Purpose:** Compensate the originator of a foundational, IP-protectable idea via a royalty-style slice stream, without over-rewarding "having an idea" generically.
- **Who can make it:** The originator of "the" foundational idea the company is built on — explicitly **not** for ideas generated "on the job" as part of a normal role ("Ideas generated 'on the job' usually don't get royalties. If you work for a company, coming up with great ideas is part of your job.").
- **Required inputs:** Royalty rate (CONFIG-005); revenue attributable to the idea.
- **Preconditions:** The idea must be "good and unique enough that it creates some sort of 'ownable' intellectual property, usually in the form of a patent or copyright," and must create a **sustainable competitive advantage** — the book gives a contrast example: a hamburger-stand business idea is not unique enough on its own; a patentable invention is. **AMBIGUOUS — REQUIRES HUMAN DECISION** on how a system would programmatically test "sustainable competitive advantage" — this is a qualitative, human-judgment gate in the source, not a formula.
- **Valuation method:** `FMV of Ideas = Royalty Rate × Revenue Generated from the Idea`, and only for revenue **directly attributable** to that idea (explicit "my publisher" analogy: an author gets royalties only on their own book's sales, not another author's).
- **Formula:** `Slices = (FMV of Ideas − Cash Royalty Paid) × Non-Cash Multiplier` (Ch. 15 table shows "Sales... ((Sale Amount x Royalty) – Cash Payment) x Non-Cash multiplier" — the book applies the identical structural formula to idea-royalties and to commission-based sales; see note below).
- **Multiplier:** Non-Cash (2×).
- **Resulting slices:** Recurring, tied to ongoing attributable revenue, unless/until the company pays the royalty in cash.
- **Timing:** Recognized as attributable revenue is generated (recommended monthly cash-collected basis, per the general sales-recognition guidance in Ch. 6 "Customers," though that specific recommendation is stated in the context of commissions, not explicitly restated for royalties — **AMBIGUOUS** whether the same monthly/cash-collected recognition timing applies to idea royalties).
- **Limits/caps:** None numeric; qualitative "ownable IP" gate above.
- **Exceptions/variant — Advance:** "A lump-sum advance[/chunk of slices] may be appropriate," deducted against future royalty payments until paid back, "then regular royalty payments can be made (in slices)." Precondition: "the inventor should be the kind of person who earns advances" (author gives himself as an example vs. a "first-time author") — **AMBIGUOUS — REQUIRES HUMAN DECISION** on how eligibility for an advance would be determined in software.
- **Exceptions — pre-founding development:** "In some cases, the time and money spent developing the idea before the company started could be translated into slices using the relevant [time/cash] calculations. In these cases, the development of the idea would be part of the development of the company and the royalty would not apply." This is a **mutually exclusive alternative path** to the royalty model for the same idea.
- **Recovery treatment note:** "If a terminated participant is entitled to a royalty for their intellectual property, they will continue to contribute slices unless the company pays the royalty in cash" (Ch. 7 "Rent and Royalties") — see conflict flagged in Section 24.
- **Source:** Chapter 6 "Ideas"; Chapter 7 "Rent and Royalties"; Chapter 11 "Intellectual Property" (retrofit variant); Chapter 15 calculation table.

### 4.9 Relationships — Sales Commission
- **Purpose:** Reward the individual responsible for converting a relationship into a completed sale.
- **Who can make it:** Typically a designated commissioned salesperson; explicitly **not** typically founders/senior managers or advisors ("Founders and other senior managers do not generally take a commission... Advisors usually don't take commission either").
- **Required inputs:** Revenue amount; Commission Rate (CONFIG-004).
- **Preconditions:** The person must have **driven** the sale, not merely made a casual introduction — "A casual introduction probably isn't good enough." Whoever "does the rest" of the work to close, even after someone else supplied the initial contact, is the one entitled to the commission slices.
- **Valuation method:** `FMV = Revenue × Commission Rate`.
- **Formula:** `Slices = ((Revenue × Commission Rate) − Cash Commission Paid) × Non-Cash Multiplier`.
- **Multiplier:** Non-Cash (2×).
- **Resulting slices:** Per recognized sale/period.
- **Timing:** Company must decide, in advance, whether to recognize at time-of-sale or time-cash-is-collected; author's recommendation: "entering sales on a monthly basis and only counting cash collected during the month," to maintain discipline/accuracy.
- **Limits/caps:** None numeric; possible tiered rate ("one commission rate on the initial sale and a lower commission rate on subsequent sales") is mentioned as a possible company policy, not a book-mandated rule — flagged as a **design option**, not a source-mandated rule.
- **Exceptions:** Introducer-only relationships (no closing work) do not earn slices.
- **Source:** Chapter 6 "Customers"; Chapter 15 calculation table ("Sales").

### 4.10 Relationships — Investor Finder's Fee
- **Purpose:** Reward whoever sources and actively shepherds a cash investment.
- **Who can make it:** Any participant who actively works the introduction through to a closed investment (not a passive introducer).
- **Required inputs:** Amount raised; Finder's Fee tiers/rates (CONFIG-006).
- **Preconditions:** "They should do more than just make an introduction; they should stay active throughout the process as needed." **Legal caveat flagged by the book itself:** "In some cases, only a registered broker can collect a finder's fee. Check with a Slicing Pie-friendly attorney" — this is a **legal-compliance gate outside the model's own math**.
- **Valuation method:** `FMV = (Amount up to $1,000,000 × 5%) + (Amount above $1,000,000 × 2.5%)` (recommended rates; Ch. 6). Simplified in the Retrofit tool to a single tier for raises under $1,000,000.
- **Formula:** `Slices = Finder's Fee FMV × Non-Cash Multiplier` (Ch. 15 table: "((Amount Raised < Cut Off × Pre-Cut-Off %) + (Amount Raised > Cut Off × Post-Cut-Off %))" — note the Pie Slicer's table for Finder's Fee does not show an explicit "× Non-Cash Multiplier" term in the raw formula text extracted from the book, unlike every other row in that same table. **INCOMPLETE SPECIFICATION** — see Section 24.
- **Multiplier:** Non-Cash (2×) — inferred from surrounding context and consistency with other relationship-based rules, but not shown explicitly multiplied in the Ch.15 table row itself (see above).
- **Resulting slices:** One-time per qualifying investment. "Only one fee per investment is allowed."
- **Timing:** At time investment closes / funds added to Well.
- **Limits/caps:** One fee per investment (hard cap, explicitly stated).
- **Exceptions:** Available even for investments that do **not** go into the Well (e.g., a convertible-loan investment) — "the Finder's Fee may still be appropriate."
- **Source:** Chapter 6 "Investors"; Chapter 15 "Pie Settings," calculation table.

### 4.11 Relationships — Partners & Vendors
- **Purpose:** Optionally reward a relationship that produces a favorable partner/vendor deal.
- **Who can make it:** Any participant who sourced the deal.
- **Required inputs:** Measurable cost savings vs. a previous solution (if using the savings-share option).
- **Preconditions:** Not customary in the US per the book; explicitly framed as optional company policy, not a mandatory rule ("I prefer not to provide slices in exchange for relationships that turn into partnerships or vendors, but it's up to you!").
- **Valuation method / Formula:** `FMV ≈ up to 5% × measurable Savings`, OR a one-time bonus, OR nothing — book gives three alternative treatments without mandating one.
- **Multiplier:** Non-Cash (2×) implied, consistent with other relationship categories (not explicitly restated here).
- **Exceptions:** If the partner/vendor itself already pays a commission to the person who closed the deal, "the company may not want to pay as well" — flagged as a company judgment call, not a hard rule.
- **Source:** Chapter 6 "Partners & Vendors."

### 4.12 Relationships — Employee Referral
- **Purpose:** Reward a participant whose relationship results in a successful new hire.
- **Who can make it:** Any current participant.
- **Required inputs:** Flat referral fee amount (CONFIG-015).
- **Preconditions:** "Typically... wait at least six months before providing the slices, so you will have time to make sure the employee sticks around" (CONFIG-016).
- **Valuation method:** `FMV = Referral Fee` (flat amount, $250–$500 recommended range).
- **Formula:** Logged as "Other," non-cash: `Slices = Referral Fee × Non-Cash Multiplier` ("In most cases, these will be treated as Non-Cash because the team member did not spend their own money," Ch. 6).
- **Multiplier:** Non-Cash (2×).
- **Timing:** Delayed until the retention precondition (≥6 months) is met.
- **Source:** Chapter 6 "Employees."

### 4.13 Facilities (Office/Warehouse Space)
- **Purpose:** Compensate a participant who provides business-use space in lieu of rent.
- **Who can make it:** Any participant with usable space to contribute.
- **Required inputs:** Fair market rent for the amount of space **actually used** by the company.
- **Preconditions:** Only the portion of space the startup actually needs is compensated — "If the landlord gives them 20 offices and they only need four, they should only have to pay for four."
- **Valuation method:** `FMV = Market Rate Rent for the Space Used`.
- **Formula:** `Slices = (Fair Market Value − Cash Payment) × Non-Cash Multiplier` (Ch. 15 table).
- **Multiplier:** Non-Cash (2×) — this is a documented **change from the original *Slicing Pie* book**, which originally applied no multiplier to facilities at all (Appendix "Facilities").
- **Timing:** As space is used/rent period elapses (implied; not explicitly detailed with a cadence).
- **Recovery treatment note:** Unlike equipment/supplies, on a "bad leaver" departure, facilities-related slices **are lost entirely** (treated as fully intangible) — "slices contributed in lieu of rents are lost in the event of termination for good reason or resignation for no good reason because they are intangible" (Appendix "Facilities"). Also: "if a terminated participant owns the facilities they will continue to contribute slices unless the company starts paying rent" (Ch. 7) — see conflict flagged in Section 24.
- **Source:** Chapter 6 "Facilities"; Chapter 7 "Rent and Royalties"; Chapter 15 calculation table; Appendix "Facilities."

### 4.14 Personal Car Use
- **Purpose:** Compensate an employee's use of a personal vehicle for company business, splitting the reimbursement's mixed cash (fuel) and non-cash (wear & tear) nature.
- **Who can make it:** Any participant using a personal vehicle for company business.
- **Required inputs:** Depends on chosen method (CONFIG-008): either (a) total reimbursement/FMV amount, reimbursed amount; or (b) miles/km driven, mileage flat-rate, actual fuel cost, reimbursed amount.
- **Valuation method (two company-selectable methods, Ch. 5):**
  1. **Simple:** Apply a single multiplier (cash or non-cash — company's choice) to the whole reimbursement amount.
  2. **Split (more accurate):** Subtract out-of-pocket fuel cost from the total; apply the **Cash Multiplier** to the fuel-cost portion and the **Non-Cash Multiplier** to the remainder (wear & tear).
- **Formula (Ch. 15 table, third variant shown — slightly more detailed than the Ch. 5 description):**
  `Slices = (Fair Market Value − Reimbursed) × Chosen Multiplier` **OR**
  `Slices = (Fuel Cost − Reimbursed) × Cash Multiplier + (((Miles/km × Flat Rate) − Fuel Cost) − Reimbursed Remainder) × Non-Cash Multiplier`
  **Note:** this Ch. 15 formula text differs in structure/precision from the plain-language description in Ch. 5 (e.g., how "Reimbursed" is subtracted differs between the two passages) — flagged as a documentation-precision issue, not necessarily a substantive conflict; see Section 24.
- **Multiplier:** Cash and/or Non-Cash depending on method chosen.
- **Source:** Chapter 5 "Personal Car"; Chapter 15 "Pie Settings," calculation table.

### 4.15 "Other" / Bonus / Spot Awards
- **Purpose:** Catch-all category for ad hoc slice awards not covered by a specific rule — e.g., discretionary bonuses for exceptional work, retrofit adjustment entries.
- **Who can make it:** Pie owner discretion.
- **Required inputs:** Amount; Cash or Non-Cash designation.
- **Valuation method:** `Slices = Amount × (Cash Multiplier OR Non-Cash Multiplier, per selection)` (Ch. 15 table: "Other... Amount x Cash multiplier OR Non Cash multiplier (depending on choice)").
- **Preconditions:** "It may be appropriate to provide a spot bonus in slices to a deserving team member in the case of exceptional work or contribution that wouldn't otherwise warrant an increase in fair market salary" (Ch. 11 "Bonus Slices"); also used for Raises/Bonus Payments logging (Ch. 6) and Retrofit entries (Ch. 11 "Moving Forward").
- **Source:** Chapter 6 "Raises and Bonus Payments"; Chapter 11 "Bonus Slices," "Moving Forward"; Chapter 15 calculation table.

---

## 5. Mathematical Rules

```text
RULE-ID: CORE-001
Formula: % Share of Reward = % Share of What's At Risk
Variables: none (foundational principle, not a computed value)
Source: Chapter 3, "The Slicing Pie Principle"

RULE-ID: CORE-002
Formula: Slices = Fair Market Value × Multiplier (Cash or Non-Cash)
Variables:
  Fair Market Value = monetary value of the at-risk portion of a contribution
  Multiplier = Cash Multiplier (CONFIG-002) or Non-Cash Multiplier (CONFIG-001), by contribution type
Output: Slices contributed by this event
Source: Chapter 4, "Summary"

RULE-ID: OWN-001
Formula: Individual Ownership % = Individual's Slices ÷ Total Slices in the Pie
Variables:
  Individual's Slices = cumulative slices attributed to one participant
  Total Slices = sum of all participants' slices at that moment
Output: Ownership / profit-share percentage
Example from book: Norvin and Anson, each with 100 S in Q1 → 50%/50% each (Ch. 1)
Conditions: Recalculated "on a rolling basis" any time slices change (Ch. 4). Applies until Pie freeze (Ch. 8), after which it is the terminal fixed split ("Individual's slices ÷ all slices," Legal Issues — Terms for Allocation).
Source: Chapter 1 ("Slicing Pie in Action"); Chapter 4; Legal Issues — "Terms for Allocation"

RULE-ID: TIME-001
Formula: Hourly Rate = Annual Fair Market Salary ÷ Working Hours Per Year (2,000 default)
Variables:
  Annual Fair Market Salary = currency/year
  Working Hours Per Year = hours/year (CONFIG-003)
Output: Hourly FMV rate
Source: Chapter 6, "Time"

RULE-ID: TIME-002
Formula: Slices = ((Fair Market Salary ÷ 2000) × Hours) × Non-Cash Multiplier
Variables: Hours = hours logged for the period
Output: Slices for a time-tracking entry
Source: Chapter 15, calculation table

RULE-ID: TIME-003
Formula: Slices Per Hour = Hourly Rate × Non-Cash Multiplier
Output: A derived reference metric ("how many slices you contribute with every hour")
Source: Chapter 6, "Time"

RULE-ID: CASH-001
Formula: Fair Market Value (of spent cash) = Amount of Cash Spent
Source: Chapter 5, "Risk Tolerance"

RULE-ID: CASH-002
Formula: Slices (Expenses) = (Amount Paid − Reimbursed) × Cash Multiplier
Source: Chapter 15, calculation table (consistent with Ch. 5 examples)

RULE-ID: EQUIP-001
Formula: Slices (New equipment/supplies) = (Amount Paid − Reimbursed) × Cash Multiplier
Source: Chapter 5; Chapter 15

RULE-ID: EQUIP-002
Formula: Slices (Pre-owned, <1 yr) = (Amount Paid − Reimbursed) × Non-Cash Multiplier
Source: Chapter 5; Chapter 15

RULE-ID: EQUIP-003
Formula: Slices (Pre-owned, >1 yr) = (Fair Market/Resale Value − Reimbursed) × Non-Cash Multiplier
Source: Chapter 5; Chapter 15

RULE-ID: WELL-001
Formula: Slices_i (per withdrawal) = (Withdrawal Amount × Contributor_i's % Ownership of Well Balance at time of withdrawal) × Cash Multiplier
Example from book: Julie & Chuck each own 50% of a $20,000 Well; a $1,000 withdrawal attributes $500 to each, generating 2,000 slices each ($500 × 4). After Suzanne deposits $15,000 more (Well = $30,000; Suzanne 50%, Julie/Chuck 25% each), a $10,000 equipment purchase attributes $5,000 to Suzanne (20,000 slices) and $2,500 each to Julie/Chuck (10,000 slices each).
Source: Chapter 5, "The Well" (worked example); Chapter 15, "The Well"

RULE-ID: IDEA-001
Formula: Fair Market Value of Ideas = Royalty Rate × Revenue Generated from the Idea
Source: Chapter 6, "Ideas"

RULE-ID: IDEA-002
Formula: Slices (Idea royalty) = (FMV of Ideas − Cash Royalty Paid) × Non-Cash Multiplier
Source: Chapter 15, calculation table ("Sales" row applied to idea-royalty context; inferred structural parity — see Section 4.8 note)

RULE-ID: SALES-001
Formula: Fair Market Value (Commission) = Revenue × Commission Rate
Source: Chapter 6, "Customers"

RULE-ID: SALES-002
Formula: Slices (Commission) = ((Revenue × Commission Rate) − Cash Commission Paid) × Non-Cash Multiplier
Source: Chapter 15, calculation table

RULE-ID: FINDER-001
Formula: Fair Market Value (Finder's Fee) = (First $1,000,000 Raised × 5%) + (Amount above $1,000,000 × 2.5%)
Source: Chapter 6, "Investors"

RULE-ID: FINDER-002
Formula (as literally given in Ch.15 table): Slices = (Amount Raised < Cutoff × Pre-Cutoff %) + (Amount Raised > Cutoff × Post-Cutoff %)
Note: No explicit "× multiplier" term appears in this specific table row in the extracted text — INCOMPLETE SPECIFICATION (see Section 24).
Source: Chapter 15, calculation table

RULE-ID: FACILITY-001
Formula: Fair Market Value (Facilities) = Market Rate Rent for Space Used
Source: Chapter 6, "Facilities"

RULE-ID: FACILITY-002
Formula: Slices (Facilities) = (Fair Market Value − Cash Payment) × Non-Cash Multiplier
Source: Chapter 15, calculation table

RULE-ID: CAR-001
Formula (Method 1 — simple): Slices = (Fair Market Value − Reimbursed) × Chosen Multiplier (Cash or Non-Cash, company's choice)
Source: Chapter 5, "Personal Car"; Chapter 15

RULE-ID: CAR-002
Formula (Method 2 — split): 
  Slices(fuel) = (Fuel Cost − Reimbursed) × Cash Multiplier
  Slices(wear) = (((Miles/km × Flat Rate) − Fuel Cost) − Reimbursed Remainder) × Non-Cash Multiplier
  Total Slices = Slices(fuel) + Slices(wear)
Source: Chapter 15, calculation table

RULE-ID: OTHER-001
Formula: Slices (Other/bonus) = Amount × (Cash Multiplier OR Non-Cash Multiplier, per selection)
Source: Chapter 15, calculation table

RULE-ID: BUYOUT-001
Formula: Buyout Price = Outstanding Slices × Currency Rate per Slice (recommended $1/slice, US)
Example from book: 1,000 outstanding slices, USD fund → $1,000 buyout price
Source: Chapter 7, "Buyout Price"

RULE-ID: DILUTION-001 (illustrative, not a named formula in the book, but a worked numeric example)
Example: Founder Daisy pays developer Ty $10,000 cash for building an app → Pie accumulates 40,000 slices (Cash Multiplier 4× applied to Daisy's $10,000 spend, since Daisy is the one bearing the cash outlay). If Ty instead forgoes cash compensation and takes slices directly for his own unpaid time/work, "the Pie will only accumulate 20,000 slices (for Ty)" — i.e., the Non-Cash Multiplier (2×) applies to Ty's own forgone-compensation value instead of the Cash Multiplier applying to Daisy's cash outlay, and Daisy retains the $10,000 for other uses (e.g., marketing).
Source: Chapter 9, "Financing the Pie" (introductory example)
```

**AMBIGUOUS — REQUIRES HUMAN DECISION:** The book gives two visually/structurally different presentations of the Slicing Pie formula (a fraction-style diagram in Ch. 1/Ch. 3/Ch. 4 that could not be rendered as text by the extraction tool — appearing as blank lines in the text layer — versus the explicit textual restatement "Individual's slices ÷ all slices" in the Legal Issues chapter). The textual restatement (OWN-001) is used throughout this document as authoritative since it is unambiguous prose, but the original diagram content itself could not be verified from the text-extracted PDF and would benefit from a visual check of the original page images if higher fidelity is required.

---

## 6. Time Contribution Rules

**Complete calculation flow (Employee/Founder path):**
1. Negotiate and record an annual **Fair Market Salary** for the role (Ch. 6, "Time") — a genuine "what would this role pay elsewhere" salary, not a discounted "startup rate" (Ch. 11 explicitly warns against "start-up rates").
2. Convert to an hourly rate: `Hourly Rate = Annual Salary ÷ Working Hours Per Year` (TIME-001).
3. As hours are worked, log them (recommended: daily/weekly granularity, with optional notes/project tag).
4. If any cash has been paid toward that salary, reduce the "at-risk" salary basis by the **annualized** cash amount going forward (prospective only — "It will not retrofit slices already calculated," Ch. 6 "Overtime" sidebar). If a payment schedule is irregular, a **Lump-Sum payment** may instead be applied, which "will reduce slices starting with those from cash contributions" (Ch. 6) — i.e., it draws down the at-risk *cash* pool before the at-risk *time* pool (see Section 4.6/Section 16 ordering rule).
5. Slices = `((Salary ÷ 2000) × Hours) × Non-Cash Multiplier` per logged period (TIME-002).
6. If the role is overtime-eligible, the same formula applies to overtime hours as well (no separate rate structure specified — **INCOMPLETE SPECIFICATION**).
7. If the company eventually pays 100% of FMV salary in cash, the time contribution generates **zero** further slices (Ch. 6, "Time").

**Different participant categories and their variant treatment:**
- **Ordinary employees/founders:** As above (Section 4.1).
- **Contractors:** Contract hourly rate (not annualized salary) as FMV basis; subject to a company buyout right up to 200% of base within 1 year (Section 4.2).
- **Advisors:** Optional hourly cap at 200 slices/hour with a 10-hour minimum precondition; in exchange, immunity from termination if the cap is accepted (Section 4.3).

**Caps:** Only advisors have an explicit hourly-rate cap (CONFIG-010); no cap is described for ordinary employee or contractor time.

**Time tracking:** Recommended granularity is flexible ("daily or weekly basis... organize time and expenses based on projects," Ch. 3); the book explicitly states time-tracking discipline is required ("keeping track takes a little discipline") but grants latitude on exact granularity ("a monthly entry that says '120 hours: did stuff'" is cited as an acceptable minimum, though the author states a personal preference for more detail).

**Timing of slice allocation:** Continuous, as hours are logged — not batched to a fixed cadence by rule (though monthly logging is used as an illustrative cadence in several places).

**Special circumstances:**
- **Open vacation policy recommended** specifically to avoid needing to track/manage slices for paid time off (Ch. 6, sidebar note) — this is a **recommendation**, not a rule with a formula; the book does not specify how PTO would be handled if a company chose *not* to adopt an open policy. **INCOMPLETE SPECIFICATION.**
- **Raises:** If a participant becomes "more valuable" (e.g., "lots of good ideas"), they "may deserve a raise" — no formula is given for how/when a raise should be granted; this is a qualitative management decision, not a system-computed value.

**Source:** Chapter 6 ("Time," "Built-In Incentives," "Overtime," "Value," "Raises and Bonus Payments," "Contractor Time"); Chapter 7 ("Advisory Board Members"); Chapter 11 ("Fair Market Salary," "Average Hours per Week Worked"); Chapter 15 ("Team Member Settings," calculation table).

---

## 7. Cash and Expense Rules

- **Unreimbursed expenses:** See Section 4.4 / CASH-002. Customary-expense test applies (commuting and personal meals excluded).
- **Reimbursement:** Any amount reimbursed is subtracted from FMV before the multiplier is applied (universal pattern across cash-type formulas).
- **Cash multiplier:** 4× (CONFIG-002), applied to actually-spent cash.
- **Timing of contribution recognition:** Cash contributions are recognized **when spent**, not when committed or deposited — "If the cash isn't spent, it's not at risk. It's just sitting in the bank. Slices get allocated when the cash gets spent" (Ch. 5).
- **When money becomes "at risk" (explicit definition test):** Money is at risk "only when it gets spent or otherwise tied up" — the book gives a specific edge-case example: a landlord-held **security deposit** is at risk even though it hasn't been "spent" in the ordinary sense, because it is tied up and could be lost (Ch. 5, "The Well"). **This implies "at risk" ⊇ "spent," but the book does not give a general-purpose formal test for "otherwise tied up" beyond this one example — INCOMPLETE SPECIFICATION** for edge cases like escrow, pre-paid non-refundable deposits, etc.
- **Company Well:** See Section 4.5 / WELL-001. Key rule: deposits generate no slices; withdrawals generate slices proportional to each contributor's **current** ownership share of the Well balance at time of withdrawal.
- **Financial contribution recovery:** See Recovery Framework (Section 14). Cash contributions are treated specially compared to intangible non-cash contributions on "bad leaver" departures — cash/tangible slices are **recalculated without the multiplier** (i.e., reduced from 4× to 1×) rather than zeroed out, per the book's Legal Issues contract language: "Cash contributions and the fair market value of tangible property are the amount of cash spent times one" (as opposed to non-cash intangible contributions, "the fair market value of the contribution times zero").
- **Loans/credit:** See Section 4.6 / CASH-002 variant. Loan **principal itself never generates slices**; only actual out-of-pocket repayment (or missed-payment) events do, and only for whoever is bearing the repayment burden.
- **Company financing priority on sale/dissolution:** "Loan payments get paid as a regular expense of the company and, if the company is sold, loans get paid off before equity holders get disbursements" — i.e., debt has payment priority over the Pie (Ch. 9, "Personal Loans").

**Source:** Chapter 5 (entire chapter); Chapter 9 ("Financing the Pie," "Well Money," "Personal Loans," "Bank Loans/Credit Cards"); Chapter 11 ("Cash," "Adjustments," "Overcompensation").

---

## 8. Company Well

- **Definition:** A company savings account that pools cash contributions from active participants (and sometimes friends/family/small angels) before it is spent (Ch. 5).
- **Ownership tracking:** The Well itself has a running **ownership percentage per contributor**, based on relative deposit amounts (worked example: Julie/Chuck 50/50 → after Suzanne's deposit, Suzanne 50%, Julie/Chuck 25% each) — this % is distinct from, and a precursor to, Pie slice ownership.
- **Deposit event:** No slices generated. Ownership-of-Well-balance % updates.
- **Withdrawal event:** Slices generated per WELL-001, proportional to **each contributor's ownership % of the Well at the moment of withdrawal** (not at their original deposit time, and not based on cumulative-ever-deposited amounts if the Well composition has since changed via other deposits/withdrawals).
- **Depletion:** "If the Well balance reaches zero, all slices will have been allocated for that 'round.'" — Implies the Well can be replenished in subsequent "rounds," each independently tracked for ownership-at-withdrawal purposes. **INCOMPLETE SPECIFICATION** on exactly how "rounds" are bounded/reset in the underlying data model — the book does not formally define a "round" as a discrete object.
- **Legal wrapper:** "The Well agreement is essentially a loan agreement... When withdrawals are made... the amount of the withdrawal is treated as a payment towards the balance on the loan. At the same time, the money converts to slices in the Pie." No interest is charged "unless required by law." (Ch. 5)
- **Best suited for:** Active participants; arms-length/passive investors are steered instead toward convertible notes/SAFEs (Ch. 5, Ch. 9).
- **Finder's Fee interaction:** The Pie Slicer applies a Finder's Fee calculation to a Well deposit only if a Finder's Fee recipient is explicitly designated for that deposit (Ch. 15, "The Well").

**Source:** Chapter 5, "The Well"; Chapter 15, "The Well."

---

## 9. Equipment and Supplies

See Section 4.7 (contribution type) and EQUIP-001/002/003 (formulas). Key structural points not to lose in implementation:

- **Ownership transfer is a side effect of slice issuance**, not a separate legal step described in the model: "when slices are received, the supplies and equipment become the property of the company."
- **Personal laptops/cellphones** are called out as a common **exception** — typically no slices, and no transfer of company ownership, so a departing employee keeps them.
- **De minimis judgment call** for small personal supplies — no numeric threshold given (AMBIGUOUS).
- Age boundary for "new" vs. "pre-owned" treatment is exactly **1 year**, but note this age boundary governs **which multiplier/valuation-basis applies at contribution time**, not eligibility to contribute at all.
- **Valuation source for resale value** (>1 year old items): the book suggests eBay.com, Craigslist, or "industry classified listings for similar supplies or equipment" — informal/non-authoritative sources, not a mandated data feed.

**Source:** Chapter 5, "Supplies & Equipment"; Chapter 11, "Equipment and Supplies" (retrofit variant, warns against double-counting items that may already be included in "cash" entries); Appendix, "Pre-Owned Supplies and Equipment."

---

## 10. Ideas, IP and Relationships

Covered in Sections 4.8–4.12. Summary of the **triggering event** for each:

| Mechanism | Triggering Event | Source |
|---|---|---|
| Idea royalty | Revenue directly attributable to a qualifying "ownable" idea is generated | Ch. 6 "Ideas" |
| Idea advance | Company grants an upfront slice advance to an eligible idea originator | Ch. 6 "Ideas" |
| Sales commission | A sale is closed (with active involvement, not mere introduction) | Ch. 6 "Customers" |
| Investor finder's fee | An investment closes, with active involvement through the process | Ch. 6 "Investors" |
| Partner/vendor reward (optional) | A partner/vendor relationship produces measurable savings or a deal | Ch. 6 "Partners & Vendors" |
| Employee referral fee | A referred candidate is hired **and** remains employed through the waiting period (≥6 months recommended) | Ch. 6 "Employees" |

**Source:** Chapter 6, subsections as noted; Chapter 7, "Rent and Royalties."

---

## 11. Sales and Finder Fees

See SALES-001/002 (Section 5) and Section 4.9–4.10. Key rules:

- **Commission rate uniformity:** "Make sure you pay the same commission to all salespeople" (Ch. 6) — a stated fairness constraint, phrased as a recommendation rather than an enforced system rule.
- **Recognition timing (recommended, not mandatory):** Monthly, cash-collected basis (Ch. 6, "Customers").
- **Finder's fee legal gate:** Only a registered broker may be legally entitled to collect a finder's fee in some jurisdictions — flagged by the book as a legal question outside the model itself (Ch. 6, "Investors").
- **Finder's fee cap:** One fee per investment (hard cap).
- **Alternative to finder's fee:** A "one-time spot bonus or something similar" if the company is "uncomfortable paying the finder's fee" (Ch. 6) — an explicitly offered alternative, not a formula-governed substitute.

**Source:** Chapter 6, "Customers," "Investors"; Chapter 15, "Pie Settings," calculation table.

---

## 12. Ownership Calculation

- **Formula:** OWN-001 (`Individual's Slices ÷ Total Slices`), recalculated on a rolling basis (Ch. 4).
- **State transition, confirmed consistent with the book:**
```text
New Contribution → FMV Calculation → × Multiplier → New Slices
    → Added to Individual's Cumulative Slices
    → Added to Total Pie Slices
    → Individual Ownership % = Individual's Slices ÷ Total Slices (recomputed for ALL participants)
```
  This sequence is directly supported by the worked Norvin/Anson example in Chapter 1, where each new contribution round changes both the numerator (for the contributing individual) and the denominator (for everyone), shifting all percentages simultaneously.
- **Addition of new participants:** A new participant's contributions simply add new slices to the total; this dilutes existing participants proportionally (implied throughout; explicit in the Merrily/Anne replacement narrative in Ch. 1, and in the "on-the-job buyout" description in Ch. 7: "the Pie will recalculate everyone else's shares, which means they will all have a higher percentage" when slices are removed — the converse holds when slices are added).
- **Whether historical ownership is "preserved":** Historical **slice counts** for past contributions are not retroactively altered by later settings changes ("it will not go back in time and change past contributions," Ch. 15) — but **ownership percentage** is NOT preserved historically in the sense of being locked in; it is continuously recalculated as the denominator (total slices) changes. The book is explicit that this is intentional and desirable (Ch. 1: "One might argue that earlier contribution is riskier, but measuring risk in a startup is as impossible as measuring future value" — i.e., no time-decay/seniority weighting is applied).
- **Rounding rules:** **INCOMPLETE SPECIFICATION** — no rounding rule (e.g., decimal precision, round-half-up, etc.) is specified anywhere in the source for either slice counts or resulting percentages.
- **Zero-slice participants:** Explicitly addressed in the "Overcompensation" context (Ch. 11): if adjustments bring a participant's at-risk balance to exactly zero, "they have not risked anything and, therefore, would not have slices" — implying zero-slice participants are a valid, expected state (e.g., someone paid 100% of FMV). The book does not state whether a zero-slice participant is still considered a "participant" in the Pie for any other purpose (e.g., visibility, voting) — **AMBIGUOUS**.

**Source:** Chapter 1 ("Slicing Pie in Action"); Chapter 4; Chapter 7 ("On-The-Job Buyouts"); Chapter 11 ("Overcompensation"); Chapter 15 ("Team Member Settings").

---

## 13. Participant Lifecycle

The book does not present a single formal state-machine diagram; the following states are **inferred from explicitly described behaviors** across chapters, per the requested lifecycle skeleton. States not directly evidenced in the text are omitted.

| State | Entry Conditions | Exit Conditions | Allowed Actions | Restricted Actions | Effect on Slices |
|---|---|---|---|---|---|
| **Candidate/Prospective** | Someone under consideration to join, before any at-risk contribution has been logged. (Inferred; not a named state in the book, but implied by hiring-negotiation language in Ch. 6/Ch. 11 — e.g., salary negotiation described as occurring **before** contribution tracking begins.) | Begins contributing → becomes Active Participant. | Negotiate FMV salary/role terms. | None described. | None yet. |
| **Active Participant** (Employee/Founder/Executive) | FMV salary agreed; contributions begin being logged (Ch. 15, "Team Member Settings": salary "required when adding the team member for the first time"). | Separation event (see Recovery Framework, Section 14) OR Pie freeze (Section 17). | Log contributions; accrue slices; view own contributions (and, if Owner/Executive, others'). | — | Slices accrue per contribution-type rules. |
| **Active Participant — Advisor** | Designated "Advisor" role at add-time (Ch. 15, "User Roles"). | Advisor themselves states they no longer wish to work with the company → treated as "resignation for no good reason" (Ch. 7). | Log advisory hours; view own contributions only (Ch. 15: Advisors "cannot view any information related to the Pie, except for their personal contributions"). | **Cannot be terminated by the company** if capped-hourly option accepted (Ch. 7; explicitly enforced in the Pie Slicer per Ch. 15: "will not allow you to terminate an advisor"). | Slices accrue per TIME-003 (capped) or uncapped time formula. |
| **Active Participant — Contractor** | Engaged for a specific project, buyout terms agreed (implied). | Buyout executed, OR engagement ends. Termination rules ("Recovery Framework") explicitly **do not apply** to contractors once slices are accounted for (Ch. 7: "Once the contractor's slices are accounted for, you can't fire them and get the slices back"). | Log time at contract rate; sell back slices voluntarily or accept company buyout offer within the 1-year window. | Company cannot force-recover contractor slices outside the defined buyout mechanism/window. | Slices accrue per Section 4.2. |
| **Departed — Buyout Pending** | A separation event has occurred; slices remain in the Pie "until they are bought out" (Ch. 7, Pie Slicer note). | Buyout executed (removes individual and slices) OR no buyout ever occurs (may persist indefinitely as an absentee owner). | (Departed individual) — accept or decline buyout offers, per departure-type rights (Section 14). | Departed individual generally cannot make new at-risk contributions (implied — separation ends active participation). | Slices frozen at departure-time value (subject to type-dependent recalculation — see Section 14) until bought out. |
| **Departed — Bought Out** | Buyout transaction completed. | Terminal for that individual (unless slices are sold instead to another person — see Section 15/Person-to-Person Sales). | None (no longer a participant). | — | Slices removed from Pie; total slices decrease; remaining participants' % increases (Ch. 7, "On-The-Job Buyouts"). |
| **Departed — Retained Absentee Owner** | Separation event where the individual is entitled to keep slices and is not obligated to sell (e.g., fired for no good reason, resigned for good reason) and no buyout has (yet) occurred. | Buyout at a later date, or company sale (in which case they receive their proportional share of proceeds), or indefinite persistence. | Receive profit/sale distributions proportional to retained slices; can be offered — but not compelled into — a buyout. | Cannot be forced to sell (explicit: "should not be obligated to sell"). | Slices retained at full (multiplied) value; may benefit from Claw Back rights (Section 14). |
| **Pie Frozen (post-breakeven/Series A)** | Company reaches breakeven or closes Series A (Section 2, "Pie freeze"). | Not described as reversible in the text (see Section 17 ambiguity). | Participants receive fixed-split profit/sale distributions per their frozen ownership %. New joiners are paid in cash/normal compensation, not slices. | No new slices allocated to any participant for ongoing contributions (Ch. 8). | Ownership % is fixed as of freeze. |

**Note on Investors as a lifecycle category:** Friends/family/small-angel Well investors are explicitly described as **not subject to "firing"** at all as long as their role is purely investment — they retain slices with multipliers indefinitely unless they themselves request their money back (treated identically to "resignation for no reason," i.e., paid back **without** the multiplier when/if the company can afford it) (Ch. 7, "Investors"). This is a distinct lifecycle branch from the Employee/Contractor/Advisor branches above.

**Source:** Chapter 6 ("Time," "Contractor Time"); Chapter 7 (entire chapter); Chapter 8 ("Freezing the Pie"); Chapter 15 ("User Roles," "Team Member Settings").

---

## 14. Departure and Recovery

### 14.1 The Four Departure Scenarios (Ch. 7, "Nature of the Separations")

1. **Fired for Good Reason** (a.k.a. "for cause," "Terminated for Cause," UK: "Bad Leaver") — employee's own behavior caused the firing. Examples given: uncorrected performance issues (**after at least two documented warnings** — a stated precondition, not optional per the book's recommendation), stealing, sexual harassment, threatening coworkers, drug abuse, "other extreme behavior."
2. **Fired for No Good Reason** (a.k.a. "without cause") — company-initiated separation not tied to employee fault. Examples: change in strategy, reduction in force, elimination of redundant positions, "just because." Book notes most US jobs are "at will."
3. **Resigned for Good Reason** (a.k.a. "for cause" from the employee's side) — company's decisions effectively pushed the employee out. Enumerated good reasons (Ch. 7, "Resign for Good Reason"):
   - Adverse change in title/responsibilities.
   - Adverse change in compensation that does **not** affect other participants at the same level.
   - Relocation of the company more than **50 miles** from its original location.
   - Death or disability.
   - Adoption of the Slicing Pie model after a fixed-split agreement was already in place ("retrofitting" — book states "any unexpected change of a person's equity would be good reason").
   - Changes to Pie Settings ("this, in effect, changes the compensation program").
4. **Resigned for No Good Reason** — employee-initiated departure unrelated to company fault ("no longer believe in the company's vision," "found a better job," etc.).

### 14.2 Decision Table — Slice Treatment by Scenario and Contribution Category

| Departure Scenario | Time / Non-Cash Intangibles (relationships, ideas w/o royalty-continuation, general non-cash) | Cash Contributions | Equipment / Supplies (tangible) | Ideas (royalty stream) | Facilities (rent-in-kind) | Buyout | Clawback | Non-Compete Expected? | Non-Solicitation Expected? |
|---|---|---|---|---|---|---|---|---|---|
| **Fired for Good Reason** | **Lost** — recalculated at ×0 (zeroed) | **Retained**, recalculated **without multiplier** (×1 instead of ×4) | **Retained**, recalculated **without multiplier** (×1) | Continues accruing "unless the company pays the royalty in cash" (Ch. 7 — see 14.5 conflict note) | **Lost** (explicitly "intangible," per Appendix) | Company **may** (not obligated to) force buyout at outstanding-slices value | **Not** applicable | Yes | Yes |
| **Fired for No Good Reason** | **Retained** in full (with multiplier) | **Retained** in full (with multiplier) | **Retained** in full (with multiplier) | Retained/continues (no special note) | Retained/continues (no special note) | Company **may offer**; employee **not obligated to sell** | **Applies** (1-year window on subsequent higher-value transaction) | **No** — company "can't prevent the individual from going to work for a competitor" | Company **may** ask for non-solicitation (~1 yr) |
| **Resigned for Good Reason** | **Retained** in full (with multiplier) — "essentially the same as being fired for no good reason" | **Retained** in full | **Retained** in full | Retained/continues | Retained/continues | Company **may offer**; employee **not obligated to sell** | **Applies** | **No** — "They should not be asked to agree to a non-compete" | Company **may** ask for non-solicitation |
| **Resigned for No Good Reason** | **Lost** — recalculated at ×0 | **Retained**, recalculated **without multiplier** (×1) | **Retained**, recalculated **without multiplier** (×1) | Continues "unless company pays... in cash" (per Ch.7 general rule — see 14.5 conflict note) | **Lost** (intangible) | Company **may** force buyout | **Not** applicable | Yes | Yes |

*(Only cells directly supported by the text are populated; where the book states a rule generally for "termination for good reason or resignation for no good reason" as a pair, and separately for "termination for no good reason or resignation for good reason" as a pair, that pairing is preserved exactly as given — the book consistently treats these as two symmetric buckets: "bad leaver" [employee-at-fault] vs. "good leaver" [company-at-fault].)*

### 14.3 Buyout Price Formula and Rationale

- `Buyout Price = Outstanding Slices × Currency Rate per Slice` (BUYOUT-001).
- **"Bad leaver" buyout (Fired-Good-Reason / Resigned-No-Good-Reason):** Because non-cash intangible slices were already zeroed and cash/tangible slices already de-multiplied, the resulting buyout "essentially pay[s] them back for cash and tangible contributions" — i.e., a return-of-capital-like outcome, no risk premium.
- **"Good leaver" buyout (Fired-No-Good-Reason / Resigned-Good-Reason):** Full multiplier-inclusive slice value is used, so "they get compensated for the risk they took... what they would have been paid on the open market times the multipliers. This provides a nice rate of return."
- Buyout price is explicitly stated to **not imply a company valuation** — "it simply implies a fair settlement" (Ch. 7).

### 14.4 Claw Back

- **Trigger:** A "bad leaver"-side company-forced OR "good leaver" voluntary buyout occurs, and **within 1 year** a transaction (e.g., a company sale) takes place "that would have led to a higher return."
- **Effect:** "the person should be paid the difference."
- **Applicability:** Only applies to buyouts of people who were **fired for no good reason or resigned for good reason** ("good leavers"). Explicitly **does not apply** if "the person was fired for good reason or resigned for no good reason."
- **INCOMPLETE SPECIFICATION:** No formula is given for computing "the difference" (e.g., is it based on per-share sale price vs. the $1/slice buyout rate? Is it net of the multiplier that was already paid?). This is flagged for human decision.

### 14.5 On-the-Job Buyouts and Person-to-Person Sales (not tied to departure)

- **On-the-job buyout:** The company can buy back slices from a **still-active** participant using company money; bought-back slices vanish, and "the Pie will recalculate everyone else's shares, which means they will all have a higher percentage" (Ch. 7).
  - **Company-initiated offer:** at the current rate (e.g., $1/slice) — company can offer more or less; participant can accept or decline; company **cannot** force this.
  - **Employee-initiated request:** Treated as the employee "backing out" of some of their at-risk position. If the company has funds, it can provide lump-sum payments that reduce the employee's at-risk contributions — **starting with cash contributions** — up to their total at-risk balance, and slices are recalculated after payment. Explicit caution: "Be careful, however, that the employee isn't simply trying to get paid before quitting... Consider waiting before making payments or paying in installments."
- **Person-to-person sale (post-freeze context, Ch. 8, "Person-to-Person Sales"):** If participant A buys participant B's slices, "the slices do not vanish; they stay in the Pie but belong to someone else." Company decides whether to permit this. Author's personal recommendation: avoid selling to people not actively involved (creates absentee-owner risk), and use fair market value (not the Slicing Pie $1/slice buyout price) for more established companies. **Legal validity is jurisdiction-dependent** — book recommends checking with a lawyer.

### 14.6 Special Participant Categories in Recovery

- **Advisors (capped-hourly option):** Effectively immune to company-initiated termination; only their own voluntary exit ("no longer wanted to work with you") triggers recovery, treated as "resignation for no good reason."
- **Investors (Well contributors, passive):** Cannot be "fired." Retain slices with multiplier indefinitely. If **they** request their money back, treated as "resignation for no reason" → repaid **without** the multiplier, if/when affordable.
- **Contractors:** Standard termination rules **do not apply** once slices are accounted for; only the defined contractor buyout mechanism (Section 4.2/CONFIG-012) governs recovery.
- **Rent/Royalty holders:** "If a terminated participant is entitled to a royalty for their intellectual property, they will continue to contribute slices unless the company pays the royalty in cash. Similarly, if the terminated participant owns the facilities they will continue to contribute slices unless the company starts paying rent." — **POTENTIAL CONFLICT — REQUIRES REVIEW**, flagged in Section 24, against both (a) the general "bad leaver" rule that intangible non-cash contributions are zeroed, and (b) the Appendix's specific statement that facilities-related slices are lost entirely for bad leavers.

### 14.7 Loyal Employee Exception

- **Applies to:** "Resignation for no good reason" scenario only ("I do not recommend doing this for people who are fired for good reason").
- **Mechanism:** Company may pre-adopt a rule (documented in the contract) that either (a) all slices earned **before** a set number of months (CONFIG-013) are retained regardless of the no-good-reason resignation, or (b) a flat percentage (CONFIG-014) of total slices is retained. Whichever threshold applies, slices **beyond** it are treated per the ordinary bad-leaver rule (zeroed for intangibles, de-multiplied for cash/tangible).
- **Alternative accommodation suggested first:** Reducing hours to stay involved part-time, preserving full slices without needing the Loyal Employee clause at all.

**Source:** Chapter 7 (entire chapter, all subsections cited inline above); Legal Issues — "Terms for Recovery"; Appendix — "Pre-Owned Supplies and Equipment," "Facilities."

---

## 15. Advisor Rules

(Consolidated from Sections 4.3, 13, 14.6 for direct traceability against the prompt's category.)

- Optional hourly slice cap: 200 slices/hour (CONFIG-010), with a 10-hour minimum precondition (CONFIG-011) — mechanism **AMBIGUOUS**.
- Trade-off: accepting the cap grants termination immunity; declining it forfeits that immunity in exchange for market-rate (uncapped) compensation.
- Cannot be fired by the company if capped; system-level enforcement described in the Pie Slicer ("will not allow you to terminate an advisor").
- Only path to recovery: the advisor's own voluntary exit, treated as resignation for no good reason.
- Restricted visibility: Advisors see only their own contributions in the tool (Ch. 15, "User Roles").

**Source:** Chapter 7, "Advisory Board Members"; Chapter 15, "User Roles."

---

## 16. Contractor Rules

(Consolidated from Sections 4.2, 13, 14.6.)

- FMV basis = contract/freelance hourly rate (typically higher than an equivalent salaried role), annualized as `Hourly Rate × 2,000` for entry into the standard time-slice formula.
- Company holds a **time-limited, price-capped buyout right**: up to 200% of base billed value, available for one year from the billing date; expires after that year for that billing.
- Ordinary Recovery Framework (the four departure scenarios) **does not apply** to contractors.
- Recommendation (not a rule): convert long-engagement contractors to salaried-employee status instead, since "contractor rates are so much higher... it's not fair to the other employees."
- Not every contractor will accept a slice/buyout arrangement — explicitly acknowledged as optional/negotiated.

**Source:** Chapter 6, "Contractor Time"; Chapter 7, "Contractors."

---

## 17. Pie Freeze / Termination

- **Trigger conditions (either):**
  1. **Organic breakeven:** the company is able to pay 100% of FMV, in cash, for all ongoing contributions (revenue ≥ expenses; "the model will no longer allocate slices for contributions and the model will stop changing").
  2. **Series A financing event:** "a substantial amount of money [raised] that will meet the cash needs of the company in the foreseeable future" — explicitly distinguished from smaller angel investments, which do **not** freeze the Pie and instead flow through the Well/convertible-note mechanisms. **AMBIGUOUS — REQUIRES HUMAN DECISION** on the exact quantitative threshold separating "angel" from "Series A" — none is given (the $1,000,000 figure appears elsewhere only in the Finder's Fee tier and Retrofit-tool simplification context, and is not stated as the Series A threshold itself).
- **Who determines the condition has occurred:** Not explicitly assigned to a role in the text — implicitly the company's management/Pie owner, by extension of their general authority over Pie Settings (Ch. 15), but this is **inferred, not stated**.
- **What happens to new contributions:** No further slices are allocated for at-risk contributions once frozen; the company must pay cash for anything it needs going forward. Partial payment toward FMV continues to proportionally reduce (not necessarily eliminate) further slice accrual **until** 100% FMV is reached — i.e., freeze is really the terminal state of a continuous cash-substitution process, not necessarily an abrupt one-time switch (Ch. 8, "Revenue" section: "When the out-of-pocket cash needs of the company are met, the management team can use what's left to start paying for non-cash contributions... The amount paid towards the fair market rate for these contributions will reduce the number of slices allocated for that input.").
- **What happens to ownership percentages:** Frozen/fixed at the ratio existing at the moment of freeze; becomes the terminal fixed split for future profit distributions or sale proceeds ("Individual's slices ÷ all slices," per Legal Issues language).
- **Whether the system can "restart":** **AMBIGUOUS — REQUIRES HUMAN DECISION.** The book describes freeze as a one-way state in every passage ("it will stay frozen unless the company's financial situation requires it to use more slices, instead of cash, in the future" — Ch. 8, "Revenue" section) — this single sentence is the **only** hint that a "frozen" Pie could resume allocating slices if the company's cash position later deteriorates, but no formal re-activation trigger, process, or effect on already-frozen historical percentages is described. This is flagged as a genuine ambiguity, not resolved by inference.
- **Recovery Framework after freeze:** Still applies to departures ("Although no more slices are being allocated, the rules of the recovery framework will still apply"), with the caveat that a Loyal Employee clause's retained-slice determination may depend on **how long ago** the slices were earned (Ch. 8, "Recovery").
- **Funding-related conditions:** Series A explicitly freezes the Pie and subjects all participants "to the terms of the Series A investors" (valuation-based, negotiated separately and unrelated to slice counts).
- **Revenue/breakeven conditions:** As above.
- **Exceptions:** None additional stated.

**Source:** Chapter 8 (entire chapter); Chapter 3 ("At-Risk Contributions Before Breakeven"); Chapter 10 ("This chapter only covers..." — reiterates freeze = "termination" in attorneys' terms).

---

## 18. Event Model

Each event below is supported directly by the source text. "Slice effects" and "ownership effects" reference the formulas in Sections 5/12/14.

```text
EVENT: ParticipantAdded
Trigger: Pie owner adds a new team member (Ch. 15, "Team Member Settings")
Required data: name, email, role (Executive/Employee/Advisor), fair market salary (if applicable)
Calculation: none (no slices generated by this event alone)
State changes: New participant record created
Dependencies: none
Source: Chapter 15, "Team Member Settings," "User Roles"

EVENT: TimeLogged
Trigger: Participant (or Pie owner on their behalf) logs hours worked
Required data: hours, date/period, optional project tag, optional notes
Calculation: TIME-002 (or TIME-003-capped for advisors)
State changes: New contribution record; slices added to participant and Pie totals
Slice effects: Non-Cash Multiplier applied to unpaid FMV portion
Ownership effects: All participants' % recalculated
Source: Chapter 6, "Time"; Chapter 15, "Logging Contributions"

EVENT: ExpensePaid (unreimbursed)
Trigger: Participant spends personal cash on a qualifying business expense
Required data: amount paid, amount reimbursed (if any), description
Calculation: CASH-002
Slice effects: Cash Multiplier applied to unreimbursed portion
Source: Chapter 5, "Unreimbursed Expenses"

EVENT: ExpenseReimbursed
Trigger: Company reimburses part or all of a previously logged expense
Required data: reimbursement amount, linked expense record
Calculation: Reduces the "Reimbursed" term in CASH-002/EQUIP formulas for that item
State changes: Recalculation of that contribution's slice value (going forward — historical slices already granted are not stated to be retroactively clawed back merely by later reimbursement; this interaction is INCOMPLETE SPECIFICATION — see Section 24)
Source: Chapter 5 (implied by every "Amount Paid − Reimbursed" formula)

EVENT: EquipmentContributed
Trigger: Participant contributes or purchases equipment/supplies for company use
Required data: price paid OR resale value, age of item, reimbursed amount
Calculation: EQUIP-001 / 002 / 003 depending on newness/age
State changes: Company gains ownership of the asset
Source: Chapter 5, "Supplies & Equipment"

EVENT: WellDeposit
Trigger: A participant (or friend/family/small angel) deposits cash into the Well
Required data: amount, depositor identity, optional Finder's Fee recipient
Calculation: None (no slices at deposit) — updates Well ownership %
Source: Chapter 5, "The Well"; Chapter 15, "The Well"

EVENT: WellWithdrawal
Trigger: Company draws funds from the Well to pay a bill/expense
Required data: amount, purpose (implied)
Calculation: WELL-001, applied per current Well-ownership % across all Well contributors
Slice effects: Cash Multiplier applied
Ownership effects: All participants' % recalculated
Source: Chapter 5, "The Well" (worked example); Chapter 15, "The Well"

EVENT: RevenueGenerated / SaleRecorded
Trigger: A sale is closed and (per company policy) recognized — recommended: cash collected, monthly
Required data: revenue amount, responsible salesperson (if commissioned)
Calculation: SALES-001/002
Source: Chapter 6, "Customers"

EVENT: CommissionEarned
Trigger: Subset of RevenueGenerated where a commissioned salesperson is responsible
Calculation: SALES-002
Source: Chapter 6, "Customers"

EVENT: RoyaltyEarned (Idea)
Trigger: Revenue directly attributable to a qualifying idea is generated
Calculation: IDEA-001 / IDEA-002
Source: Chapter 6, "Ideas"

EVENT: FinderFeeEarned
Trigger: An investment closes with active involvement by a participant
Calculation: FINDER-001 / FINDER-002 (formula incompleteness noted in Section 24)
Limit: one fee per investment
Source: Chapter 6, "Investors"; Chapter 15, "Pie Settings"

EVENT: ReferralFeeEarned
Trigger: A referred candidate is hired and retained through the waiting period (≥6 months recommended)
Calculation: Flat fee × Non-Cash Multiplier
Source: Chapter 6, "Employees"

EVENT: FacilitiesContributed
Trigger: A participant provides business-use space
Calculation: FACILITY-001 / FACILITY-002
Source: Chapter 6, "Facilities"

EVENT: PersonalCarUsed
Trigger: Personal vehicle used for company business
Calculation: CAR-001 or CAR-002, per configured method
Source: Chapter 5, "Personal Car"

EVENT: LoanPaymentMade / LoanPaymentMissed
Trigger: A payment is made (or missed) on a personal/company loan taken out for company purposes
Calculation: Section 4.6 rules — slices only for whoever bears the repayment (or missed-payment) burden
Source: Chapter 5, "Loans and Credit Cards"; Chapter 9, "Personal Loans"

EVENT: CashPaymentToParticipant (salary/bonus/lump-sum)
Trigger: Company pays cash to a participant against their at-risk balance
Required data: amount, participant
Calculation: Reduces at-risk basis; if a lump-sum/irregular payment, reduces cash-type at-risk balance first, then non-cash (Ch. 6, "Overtime" sidebar; Ch. 7, "Employee Requests"); prospective only for salary-rate changes
State changes: Future slice accrual reduced or eliminated for that participant's ongoing contributions
Source: Chapter 6, "Overtime" sidebar ("Raises and Bonus Payments"); Chapter 7, "Employee Requests"

EVENT: BonusSlicesAwarded
Trigger: Discretionary award for exceptional work
Calculation: OTHER-001
Source: Chapter 11, "Bonus Slices"

EVENT: ParticipantDeparture
Trigger: Separation occurs; classified into one of the four scenarios (Section 14.1)
Required data: departure reason/classification, departure date
Calculation: Per Section 14.2 decision table — zeroing or de-multiplying of relevant slice categories
State changes: Participant status → "Departed"; slices remain in Pie pending buyout (or forfeiture for zeroed categories)
Ownership effects: Immediate — remaining participants' % recalculated once any slices are zeroed/removed; if slices are merely recalculated at lower multiplier (not removed), total slices (and thus all %) also shift
Source: Chapter 7 (entire chapter)

EVENT: RecoveryApplied
Trigger: Same as ParticipantDeparture; represents the specific recalculation step
Calculation: Zero-multiplier or de-multiplier per Section 14.2
Source: Chapter 7; Legal Issues — "Terms for Recovery"

EVENT: BuyoutOffered
Trigger: Company (or, for on-the-job case, another mechanism) proposes to purchase outstanding slices
Required data: offer amount (may differ from default $1/slice), recipient
Calculation: BUYOUT-001 as a reference/default; actual offer may vary by mutual agreement (voluntary case only)
Source: Chapter 7, "Buyout Price," "Company Offers"

EVENT: BuyoutExecuted
Trigger: Buyout offer accepted (or, in "bad leaver" cases, forced by the company)
Calculation: BUYOUT-001
State changes: Slices removed from Pie (unless sold person-to-person, in which case they transfer, not vanish — Ch. 8, "Person-to-Person Sales"); Total Pie slices decrease; remaining ownership % increases proportionally
Source: Chapter 7, "Buyout Price"; Chapter 15 ("Clicking the bubble will remove the individual and their slices from the Pie")

EVENT: ClawbackTriggered
Trigger: Within 1 year of a "good leaver" buyout, a transaction occurs that would have yielded the departed participant a higher return
Calculation: "the person should be paid the difference" — formula INCOMPLETE SPECIFICATION
Source: Chapter 7, "Claw Back"

EVENT: CompanyFunding (Angel)
Trigger: Investment that covers part, but not all, of foreseeable cash needs
Calculation: Treated as convertible note / SAFE / loan into the Well; no direct slice formula (unless the investor opts to take slices instead, per ordinary Well rules)
Source: Chapter 8, "Series A Investment"; Chapter 9, "Convertible Notes/SAFE"

EVENT: SeriesAInvestment
Trigger: Investment that will meet the company's foreseeable cash needs (qualitative threshold — AMBIGUOUS, see Section 17)
Calculation: None (priced round; valuation negotiated separately, unrelated to slice math)
State changes: Triggers PieFrozen
Source: Chapter 8, "Series A Investment"; Chapter 9, "Venture Capital"

EVENT: BreakevenAchieved
Trigger: Revenue ≥ Expenses, sustained such that 100% of FMV can be paid in cash going forward
State changes: Triggers PieFrozen (if funding-independent breakeven path)
Source: Chapter 3 (breakeven graph); Chapter 8

EVENT: PieFrozen
Trigger: BreakevenAchieved OR SeriesAInvestment
Calculation: Ownership % fixed at current ratio; no further slice-generating events processed for at-risk contributions
Source: Chapter 8 (entire chapter)

EVENT: CompanySale
Trigger: Company is sold (implied throughout; explicit worked example in Ch. 1: "the company sells for $1,000,000")
Calculation: Proceeds distributed per current (or frozen, if applicable) ownership %; loans/debt paid first (Ch. 9); Series A investor terms apply if applicable (Ch. 8)
Source: Chapter 1 ("Slicing Pie in Action" example); Chapter 8; Chapter 9

EVENT: PersonToPersonSlicesTransfer
Trigger: One participant buys another's slices directly (post-freeze context described, though not explicitly restricted to post-freeze only)
Calculation: Slices transfer, do not vanish; valuation at FMV for "more established" companies rather than the default $1/slice rate
Source: Chapter 8, "Person-to-Person Sales"

EVENT: PieSettingChanged
Trigger: Pie owner edits a Pie Setting (multiplier, commission rate, royalty rate, finder's fee, personal car method/rate, currency)
Calculation: None retroactive — "Any changes you make to any settings will impact future contributions only; it will not recalculate the existing Pie."
Source: Chapter 4 (sidebar); Chapter 15, "Pie Settings"
```

---

## 19. Data Requirements

**Data Requirements Register** (field-level; not exhaustive of every UI label mentioned, but covers every field the book states is needed for a calculation or decision).

```text
Field: participant_id / participant_name
Type: identifier / string
Required: Always
Who provides: Pie owner (adds team member)
Used by: all contribution events

Field: participant_role
Type: enum {Owner, Executive, Employee, Advisor}
Required: Always
Validation: Determines visibility permissions and (for Advisor) eligibility for hourly cap / termination immunity
Source: Chapter 15, "User Roles"

Field: fair_market_annual_salary
Type: currency
Required: For time contributions (employees/founders/executives)
Validation: Should reflect genuine market rate, not "start-up rate" (qualitative guidance, not machine-enforceable)
Used by: TIME-001, TIME-002
Source: Chapter 6, "Time"; Chapter 11, "Fair Market Salary"

Field: advisor_hourly_cap_opt_in
Type: boolean
Required: For Advisor role, at add-time
Used by: TIME-003 vs. uncapped time formula; termination-immunity logic
Source: Chapter 7, "Advisory Board Members"

Field: contractor_billed_hourly_rate
Type: currency/hour
Required: For Contractor time contributions
Used by: Section 4.2 formula
Source: Chapter 6, "Contractor Time"

Field: hours_worked
Type: number (hours)
Required: For any time contribution entry
Validation: Should be ≥ 0 (not explicitly stated, but implied)
Used by: TIME-002
Source: Chapter 6, "Time"; Chapter 15, "Logging Contributions"

Field: contribution_date / period
Type: date
Required: For every contribution
Used by: all events; also needed for CONFIG-013 (Loyal Employee months threshold) and CONFIG-018 (claw-back 1-year window) and CONFIG-016 (referral fee 6-month wait) and CONFIG-012 (contractor 1-year buyout window)
Source: Implied throughout; explicit date-tracking need surfaces wherever a time-window rule exists (Ch. 6, Ch. 7)

Field: project_or_category_tag
Type: string / enum (user-defined list)
Required: Optional
Used by: reporting only, not slice calculation
Source: Chapter 15, "Pie Settings — Projects"

Field: expense_amount_paid
Type: currency
Required: For cash/expense contributions
Used by: CASH-002
Source: Chapter 5, "Unreimbursed Expenses"

Field: expense_amount_reimbursed
Type: currency
Required: For cash/expense/equipment/facilities contributions (defaults to 0)
Validation: Should not exceed amount_paid / FMV (not explicitly stated — INCOMPLETE SPECIFICATION on whether over-reimbursement is validated against, see Section 20)
Used by: CASH-002, EQUIP-001/002/003, FACILITY-002, CAR-001/002
Source: Chapter 5; Chapter 15 calculation table

Field: expense_customary_flag
Type: boolean / qualitative judgment
Required: To determine Pie eligibility of an expense (commuting/personal excluded)
Validation: Not a formula — human judgment ("Use your best judgment")
Source: Chapter 5, "Unreimbursed Expenses"

Field: equipment_price_paid
Type: currency
Required: For newly purchased equipment/supplies
Used by: EQUIP-001, EQUIP-002
Source: Chapter 5, "Supplies & Equipment"

Field: equipment_age
Type: duration (implied: date acquired, or a computed age)
Required: For pre-owned equipment/supplies
Validation: < 1 year vs. ≥ 1 year determines EQUIP-002 vs. EQUIP-003
Source: Chapter 5, "Supplies & Equipment"

Field: equipment_resale_value
Type: currency
Required: For pre-owned equipment/supplies ≥ 1 year old
Validation: Sourced externally (eBay, Craigslist, industry listings) — no authoritative data feed specified
Used by: EQUIP-003
Source: Chapter 5, "Supplies & Equipment"

Field: well_deposit_amount / well_depositor_id
Type: currency / identifier
Required: For Well deposit events
Used by: Well ownership % calculation
Source: Chapter 5, "The Well"

Field: well_withdrawal_amount
Type: currency
Required: For Well withdrawal events
Used by: WELL-001
Source: Chapter 5, "The Well"

Field: well_finder_fee_recipient
Type: identifier (optional)
Required: Optional, at time of Well deposit
Used by: FINDER-001/002 (if designated)
Source: Chapter 15, "The Well"

Field: revenue_amount
Type: currency
Required: For sales-commission and idea-royalty events
Used by: SALES-001/002, IDEA-001/002
Source: Chapter 6, "Customers," "Ideas"

Field: responsible_salesperson_id
Type: identifier
Required: For commission attribution
Validation: Must have been actively responsible for closing, not merely an introducer (qualitative judgment)
Source: Chapter 6, "Customers"

Field: commission_rate / royalty_rate / finder_fee_tiers
Type: percent / tiered-percent structure
Required: Configured at Pie level (CONFIG-004/005/006)
Source: Chapter 6; Chapter 15, "Pie Settings"

Field: investment_amount_raised
Type: currency
Required: For Finder's Fee calculation
Used by: FINDER-001/002
Source: Chapter 6, "Investors"

Field: referral_fee_amount / referral_hire_date / referral_waiting_period_elapsed
Type: currency / date / boolean(derived)
Required: For employee-referral events
Source: Chapter 6, "Employees"

Field: facilities_market_rent / facilities_space_used_portion
Type: currency / proportion
Required: For facilities contributions
Validation: Only the portion of space actually used by the startup is compensated
Used by: FACILITY-001/002
Source: Chapter 6, "Facilities"

Field: personal_car_method
Type: enum {Simple, Split}
Required: Configured at Pie level (CONFIG-008)
Source: Chapter 5, "Personal Car"

Field: personal_car_mileage_rate / fuel_cost / miles_driven
Type: currency/mile / currency / number
Required: For Split-method personal car contributions
Used by: CAR-002
Source: Chapter 5, "Personal Car"; Chapter 15 calculation table

Field: loan_amount / loan_payer_identity / payment_or_missed_payment_event
Type: currency / identifier / event record
Required: For loan/credit-based cash contributions
Validation: Slices depend entirely on who is bearing the repayment burden, not who took out the loan
Source: Chapter 5, "Loans and Credit Cards"; Chapter 9, "Personal Loans"

Field: departure_reason_classification
Type: enum {Fired-Good-Reason, Fired-No-Good-Reason, Resigned-Good-Reason, Resigned-No-Good-Reason}
Required: For any ParticipantDeparture event
Validation: Must be justified against the enumerated qualifying reasons where applicable (e.g., "Resigned-Good-Reason" requires one of the six enumerated triggers, Ch. 7) — WHO makes/approves this classification is not specified. INCOMPLETE SPECIFICATION (see Section 20/24).
Used by: Section 14.2 decision table
Source: Chapter 7, "Nature of the Separations"

Field: departure_date
Type: date
Required: For claw-back window (CONFIG-018), Loyal Employee threshold (CONFIG-013/014), contractor buyout window (CONFIG-012) calculations
Source: Chapter 7

Field: loyal_employee_clause_config
Type: enum {None, Months-based, Percentage-based} + threshold value
Required: Configured at Pie/legal-document level, only relevant to Resigned-No-Good-Reason
Source: Chapter 7, "Loyal Employees"; Legal Issues — "Terms for Recovery"

Field: buyout_offer_amount / buyout_currency_rate
Type: currency / currency-per-slice
Required: For BuyoutOffered/BuyoutExecuted events
Validation: Default $1/slice; voluntary offers may differ by mutual agreement
Used by: BUYOUT-001
Source: Chapter 7, "Buyout Price," "Company Offers"

Field: pie_currency
Type: currency code
Required: Configured at Pie level (CONFIG-007)
Source: Chapter 15, "Pie Settings"

Field: non_cash_multiplier / cash_multiplier
Type: decimal (unitless multiplier)
Required: Configured at Pie level (CONFIG-001/002), defaults 2 / 4
Validation: Recommended cash > non-cash, and non-cash > 1, if changed from default
Source: Chapter 4; Chapter 15
```

---

## 20. Validation Rules

### Hard Validation (source-supported "must reject/block")
- **HARD-VAL-001:** A "bad leaver" (Fired-Good-Reason / Resigned-No-Good-Reason) cannot be **compelled** to sell — wait, reverse: a **"good leaver"** (Fired-No-Good-Reason / Resigned-Good-Reason) participant "should not be obligated to sell" their slices — a forced buyout of a good-leaver must be blocked/disallowed by the system if the model is to faithfully implement the rule (Ch. 7).
- **HARD-VAL-002:** Advisors who accepted the capped-hourly option cannot be terminated by the company through the system — explicitly mirrored in the reference implementation: "The Pie Slicer will not allow you to terminate an advisor" (Ch. 15).
- **HARD-VAL-003:** Contractors, once their slices are accounted for, cannot have those slices force-recovered by the company through ordinary termination — "you can't fire them and get the slices back" (Ch. 7).
- **HARD-VAL-004:** The model "will not allocate negative slices" — if adjustments (e.g., cash payments exceeding at-risk contribution) bring a balance negative, resulting slices are floored at zero, not negative (Ch. 11, "Overcompensation").
- **HARD-VAL-005:** Only one Finder's Fee is allowed per investment (Ch. 6, "Investors": "Only one fee per investment is allowed").

### Warning / Review Conditions (source-supported "should flag, not block")
- **WARN-001:** Logging unusually high hours (e.g., 60+) that are inconsistent with prior patterns, or hours not matched by apparent productivity, is flagged in the text as a **credibility/trust concern** for the team to address — not stated as a system-enforced block, but a human-review signal (Ch. 11, "Average Hours per Week Worked": "if you log lots of hours, but don't show corresponding productivity you may damage your credibility").
- **WARN-002:** An employee requesting a cash buyout shortly before an apparent intent to quit is flagged as a scenario requiring caution/delay by management — again a human-judgment warning, not an automated rule ("Be careful, however, that the employee isn't simply trying to get paid before quitting," Ch. 7, "Employee Requests").
- **WARN-003:** Departing employee's non-solicitation/non-compete obligations vary by local enforceability — flagged as a legal-review item, not something the software can validate (Ch. 10, "Local Legal Environment").
- **WARN-004:** Finder's Fee arrangements may require the recipient to be a registered broker in some jurisdictions — flagged as a legal-review item (Ch. 6, "Investors").

**Not addressed by the book (and therefore NOT included as either hard or warning validation, per the "do not invent" instruction):**
- Whether `expense_amount_reimbursed` can exceed the paid/FMV amount.
- Whether `hours_worked` has any per-day/per-week ceiling.
- Who is authorized to classify a departure reason, or whether that classification can be disputed/appealed within the system.
- Whether duplicate contribution entries are detected/blocked.

These gaps are carried into Section 24/25 as Human Decisions Required rather than resolved here.

**Source:** As cited inline above.

---

## 21. Audit Requirements

The book does not present a formal "audit trail" specification, but repeatedly emphasizes record-keeping as central to the model's value, particularly for **investor due diligence** and **dispute prevention**. Extracted requirements:

- **Preserve, per contribution:** who contributed, what type, the FMV inputs used (e.g., salary rate, hours, price paid, revenue amount, rate/multiplier applied at the time), the resulting slice count, and the date (Ch. 6, "Value": "Time reports will not only tell you what someone is focusing on, but how productive they are"; Ch. 6, "Contractor Time" Pie Slicer note: settings changes are prospective only, implying historical calculation inputs must be preserved as-was).
- **Preserve notes/description per time entry** — explicitly requested by the reference tool ("the user will have the option to choose a Project... ask for notes on what was done during the time logged," Ch. 15).
- **Preserve receipts/evidence for expenses** — "Employees and other contributors should keep track of expenses and save receipts so they can accurately report their expenses" (Ch. 5).
- **Preserve historical Pie Setting values**, since a setting change (multiplier, rate, salary) applies only prospectively — the system must be able to reconstruct **which rate/multiplier was in force** at the time of each historical contribution to answer "why does this participant have this many slices" (Ch. 4 sidebar; Ch. 15, "Team Member Settings," "Pie Settings": "Changes to any of the settings will only affect future contributions; they will not affect past contributions").
- **Preserve departure classification and its justification** — since it drives materially different slice outcomes (Section 14.2), the reasoning/evidence for a "good reason" classification (e.g., the two required prior warnings for a performance-based Fired-for-Good-Reason case, Ch. 7) should be recorded to reconstruct the decision later.
- **Due-diligence framing:** the book explicitly cites investor due diligence as a beneficiary of these records — "Imagine how great it will be when you can show them exactly who did what and how much was spent" (Ch. 6, "Time"); "good time records are an invaluable tool for... investor due diligence" (Ch. 13, "Nobody Likes Tracking Their Time").
- **Cap table reconstruction:** the model should be able to produce a "cap table" (ownership % per participant at a point in time) on demand, described as a VC-facing deliverable (Ch. 9, "Venture Capital").

**What the book does NOT specify (flagged, not invented):** retention duration for records, immutability/tamper-evidence requirements, who has authority to edit/correct historical entries, or any formal audit-log format.

**Source:** Chapter 4 (sidebar); Chapter 5 ("Unreimbursed Expenses"); Chapter 6 ("Time," "Value," "Contractor Time"); Chapter 9 ("Venture Capital"); Chapter 13 ("Nobody Likes Tracking Their Time"); Chapter 15 ("Logging Contributions," "Team Member Settings," "Pie Settings").

---

## 22. Edge Case Register

Only edge cases directly supported by the text are listed. Each includes the book's own treatment, verbatim in substance.

| ID | Edge Case | Book's Treatment | Source |
|---|---|---|---|
| EDGE-001 | Negative at-risk balance after cash payments | Balance floors at zero; **no negative slices are allocated** ("Be careful not to overpay people in the future!") | Ch. 11, "Overcompensation" |
| EDGE-002 | Overcompensation (paid more than FMV) | Same as EDGE-001 — zero slices, explicit warning against future overpayment | Ch. 11, "Overcompensation" |
| EDGE-003 | Partial reimbursement of an expense | `(Amount Paid − Reimbursed)` term handles this natively in every relevant formula | Ch. 5; Ch. 15 |
| EDGE-004 | Loan paid by company vs. by individual | Slices depend entirely on **who bears repayment**, not on loan origination — see Section 4.6 | Ch. 5, "Loans and Credit Cards"; Ch. 9 |
| EDGE-005 | Missed loan payment | Converts to slices at the cash rate for whoever is bearing the missed payment, per missed-payment event | Ch. 9, "Personal Loans" |
| EDGE-006 | Contribution made on behalf of the company using an individual's personal credit, but company pays it back | Individual bearing the credit risk still receives **zero** slices if not personally making payments — explicitly justified as non-double-counting, not as unfairness | Ch. 5, "Loans and Credit Cards" |
| EDGE-007 | Contribution with uncertain/no clear market comparable | Not directly solved with a formula; book relies on informal market research (eBay/Craigslist for equipment; salary negotiation for time) — **no algorithmic resolution given** | Ch. 5, "Supplies & Equipment"; Ch. 6, "Time" |
| EDGE-008 | Idea with insufficiently unique/protectable IP | No royalty/slices — a hamburger-stand business idea is given as a non-qualifying example (execution, not idea, could be the differentiator) | Ch. 6, "Ideas" |
| EDGE-009 | Revenue not directly attributable to a specific idea's IP | No royalty — "If the same publisher sells a book from some other author, I don't [get a royalty]" | Ch. 6, "Ideas" |
| EDGE-010 | Casual introduction with no further involvement (relationship contribution) | No slices — "A casual introduction probably isn't good enough" | Ch. 6, "Customers" |
| EDGE-011 | Multiple people involved in one sale (one introduces, another closes) | Only the person who "does the rest" (drives it to close) earns the commission slices, regardless of who made the initial introduction | Ch. 6, "Customers" |
| EDGE-012 | Commuting expense | Explicitly excluded — not customary to reimburse, so no slices | Ch. 5, "Unreimbursed Expenses" |
| EDGE-013 | Small personal supplies brought from home (e.g., pens, tape dispenser) | Judgment call — likely no slices; no numeric threshold given | Ch. 5, "Supplies & Equipment" |
| EDGE-014 | Personal laptop/cellphone used for company work | Typically not treated as a company-owned contributed asset; no slices; item stays with the individual on departure | Ch. 5, "Supplies & Equipment" |
| EDGE-015 | Participant departs, then a company sale occurs shortly after a below-full-value buyout | Claw-back applies (for good-leaver buyouts only) within 1 year — see Section 14.4 | Ch. 7, "Claw Back" |
| EDGE-016 | Participant departs but is never bought out | Persists indefinitely as an "absentee owner"/"dead equity," continuing to hold their slices/ownership % | Ch. 7 (throughout); Ch. 9, "Venture Capital" (VCs dislike absentee owners) |
| EDGE-017 | Departing participant who owned facilities/IP continues to be owed rent/royalty | Slices continue to accrue post-departure "unless the company pays the royalty [or rent] in cash" — see POTENTIAL CONFLICT in Section 24 | Ch. 7, "Rent and Royalties" |
| EDGE-018 | Company relocates but stays within 50 miles | Does **not** trigger "good reason" resignation (the 50-mile threshold is a hard cited boundary) | Ch. 7, "Resign for Good Reason" |
| EDGE-019 | Performance-based firing without prior documented warnings | Book states this should not happen — "It's not fair to fire someone for performance-related issues without first giving them the chance to correct their behavior" (recommends ≥2 warnings) — **not stated as a hard system block**, a normative/moral guideline only | Ch. 7, "Fired for Good Reason" |
| EDGE-020 | New participant joins after the company can already afford to pay fair market salary (post-freeze or well-funded) | Gets fair market salary in cash; does **not** receive slices or a share of the profits already accrued to earlier at-risk contributors — may participate in a forward-looking bonus program instead | Ch. 8, "Profits" |
| EDGE-021 | Rounding of slice counts / ownership percentages | **Not addressed anywhere in the source** — flagged as a gap, not resolved | — |
| EDGE-022 | Multiple contribution types logged for a single event (e.g., a car trip with both mileage and a paid toll expense) | Not directly addressed; the Personal Car "Split" method is the closest analog for a single contribution type with mixed cash/non-cash character, but a mixed multi-type single event is not described | Ch. 5, "Personal Car" (closest analog only) |
| EDGE-023 | Currency conversion / multi-currency Pies | Explicitly **not supported** in the reference tool — "The Pie Slicer will not consider exchange rates" — single operating currency assumed | Ch. 15, "Pie Settings — Currency" |
| EDGE-024 | Settings changed mid-stream (multiplier, salary, rate) | Applies to future contributions only; historical slice calculations are not retroactively recalculated | Ch. 4 (sidebar); Ch. 6 ("Overtime" sidebar); Ch. 15 |
| EDGE-025 | Pie balance/Well reaches exactly zero | "All slices will have been allocated for that 'round'" — implies a Well "round" boundary concept that is not further formally defined | Ch. 5, "The Well" |
| EDGE-026 | Advisor declines the slice cap | Loses termination immunity; gets uncapped market-rate time compensation instead | Ch. 7, "Advisory Board Members" |
| EDGE-027 | Departing participant's equipment/supplies vs. facilities treatment diverge on a "bad leaver" exit | Equipment/supplies retained (de-multiplied, ×1); facilities/rent-in-kind slices **lost entirely** (treated as fully intangible) — an explicit asymmetry the book itself calls out as a deliberate Appendix-level policy update | Appendix, "Pre-Owned Supplies and Equipment," "Facilities" |

---

## 23. Feature Candidates

*(Labeled FEATURE CANDIDATE per instructions — not approved C-Transit requirements.)*

**FEATURE CANDIDATE:** Company/Pie setup wizard (currency, multipliers, commission/royalty/finder's-fee rates, personal car method, working-hours constant).
**FEATURE CANDIDATE:** Participant management (add/invite team members; assign role: Owner/Executive/Employee/Advisor/Contractor; set fair market salary).
**FEATURE CANDIDATE:** Contribution entry forms per type (Time, Expense, Equipment/Supplies, Sale/Commission, Idea Royalty, Finder's Fee, Referral, Facilities, Personal Car, Loan/Credit, Other/Bonus).
**FEATURE CANDIDATE:** Time tracking with project/category tagging and notes.
**FEATURE CANDIDATE:** Expense logging with receipt attachment.
**FEATURE CANDIDATE:** Equipment/supplies logging with age-based valuation-path branching (new / <1yr / >1yr).
**FEATURE CANDIDATE:** Well management (deposit, withdrawal, running per-contributor ownership %, Finder's Fee designation on deposit).
**FEATURE CANDIDATE:** Slice calculation engine implementing Sections 4–5 formulas, versioned against historical Pie Settings (per EDGE-024/Section 21 audit requirement).
**FEATURE CANDIDATE:** Ownership dashboard (real-time pie chart / cap table, per Ch. 15 "Display").
**FEATURE CANDIDATE:** Contribution history / reports per participant and per type.
**FEATURE CANDIDATE:** Participant history (role changes, salary changes over time, with effective-dating).
**FEATURE CANDIDATE:** Departure workflow — capture departure-reason classification, supporting justification/evidence (e.g., warning records), and trigger the correct recalculation path from Section 14.2.
**FEATURE CANDIDATE:** Recovery calculation engine (zeroing / de-multiplying per departure-category × contribution-category matrix).
**FEATURE CANDIDATE:** Buyout management (offer, accept/decline, forced-vs-voluntary distinction, claw-back tracking with 1-year window monitoring).
**FEATURE CANDIDATE:** Contractor buyout window tracking (200%/1-year rule).
**FEATURE CANDIDATE:** Advisor cap-opt-in and termination-immunity enforcement.
**FEATURE CANDIDATE:** Loyal Employee clause configuration (months-based or percentage-based) and enforcement at departure time.
**FEATURE CANDIDATE:** Pie freeze workflow (manual trigger by Pie owner upon breakeven or Series A; locks ownership % as of freeze date; disables further at-risk slice accrual).
**FEATURE CANDIDATE:** Person-to-person slice transfer/sale (with company-level allow/disallow policy toggle).
**FEATURE CANDIDATE:** Audit trail / full history log per contribution, per setting change, per departure decision (see Section 21).
**FEATURE CANDIDATE:** Reporting/export for investor due diligence (cap table export, contribution ledger export).
**FEATURE CANDIDATE:** Role-based visibility (Owner/Executive full access; Employee/Advisor self-only access), per Ch. 15 "User Roles."
**FEATURE CANDIDATE:** Retrofit/forecast one-time snapshot tool, separate from the ongoing tracking system (per Ch. 11 — explicitly described in the book as a distinct, single-point-in-time tool, not a continuous tracker).
**FEATURE CANDIDATE:** Multi-Pie support per user account (per Ch. 15 "Multiple Pies").

---

## 24. Ambiguities and Conflicts

### Ambiguous Rules
1. **Series A / freeze threshold** — no quantitative definition of "a substantial amount of money... that will meet the cash needs of the company in the foreseeable future" vs. an angel investment. (Section 2, Section 17)
2. **Advisor 10-hour precondition mechanism** — unclear whether the first 10 hours are unpaid-in-slices, or merely a gate before the arrangement activates retroactively. (Section 4.3, CONFIG-011)
3. **Advisor cap configurability** — the 200 slices/hour cap is not listed among the enumerated Pie Settings fields, unlike every other numeric constant in the book; unclear if it is meant to be adjustable in software. (CONFIG-010)
4. **De minimis threshold for small personal supplies** — "use your best judgment," no numeric guidance. (Section 4.7, Section 9)
5. **"Sustainable competitive advantage" test for idea royalties** — a qualitative, human-judgment gate with no formal test given. (Section 4.8)
6. **Advance eligibility for idea originators** — "the inventor should be the kind of person who earns advances" — no objective criteria given. (Section 4.8)
7. **Idea-royalty revenue-recognition timing** — unclear whether the monthly/cash-collected recognition guidance given for sales commissions also governs idea royalties. (Section 4.8)
8. **Series A vs. non-freezing large angel round boundary** overlaps with Ambiguity #1 but is called out separately because CONFIG-006's $1,000,000 figure (Finder's Fee tier / Retrofit-tool simplification) is **not** stated to be the same threshold as the Series A freeze trigger, yet a reader could easily conflate them. Flagged to prevent an implementation team from silently assuming they're the same number.
9. **Pie freeze reversibility** — a single clause ("it will stay frozen unless the company's financial situation requires it to use more slices... in the future") implies possible un-freezing, with zero process detail. (Section 17)
10. **Who determines/approves a departure-reason classification** — not assigned to any role in the text. (Section 20)
11. **Rounding rules** — entirely unaddressed for both slice counts and percentages. (Section 12, EDGE-021)
12. **Zero-slice participant status** — unclear if such a participant remains a "participant" for any purpose after being reduced to zero slices via overcompensation. (Section 12)
13. **Working Hours Per Year configurability** — see Conflict #2 below; also independently ambiguous as to whether this is a global constant or per-participant (e.g., for part-time roles).
14. **Reimbursement exceeding paid/FMV amount** — not addressed; unclear if this is even a contemplated scenario in the source (e.g., could represent an error, or could represent the company "paying ahead") (Section 20).

### Conflicting Rules — **POTENTIAL CONFLICT — REQUIRES REVIEW**
1. **Royalty/rent continuation after "bad leaver" departure vs. general zeroing rule.** Chapter 7's general rule states that a "bad leaver" (Fired-Good-Reason / Resigned-No-Good-Reason) loses "any slices allocated from contributions except supplies, equipment and cash contributions" (i.e., intangible non-cash contributions like royalties and rent-in-kind should be zeroed). But the same chapter's "Rent and Royalties" subsection states, without qualifying which departure type it applies to: "If a terminated participant is entitled to a royalty for their intellectual property, they will continue to contribute slices unless the company pays the royalty in cash. Similarly, if the terminated participant owns the facilities they will continue to contribute slices unless the company starts paying rent." Read literally, this second passage would let royalty/rent slices keep accruing **even for bad leavers**, contradicting the general zeroing rule — and further conflicts with the Appendix's explicit statement that facilities slices are **lost** (not merely frozen/continuing) for bad leavers. **Three passages in the same book describe three different outcomes for facilities-in-particular at bad-leaver departure** (zeroed per the general rule; continuing per "Rent and Royalties"; lost per the Appendix update). This is the single most significant conflict identified in the source and should be a priority Human Decision item.
2. **Working Hours Per Year configurability.** Chapter 15 ("Team Member Settings") describes the Pie Slicer as automatically dividing by 2,000 with no configurability mentioned in that passage, while Chapter 11 (Retrofit tool) explicitly describes the 2,000 figure as adjustable in a "settings area" because "Some countries have different hours in a working week." It is unclear whether this reflects two genuinely different tools with different capabilities (plausible, since the Retrofit tool and the ongoing Pie Slicer are explicitly described as separate tools), or an inconsistency in how the book describes the same underlying rule.
3. **Personal Car formula precision mismatch.** The plain-language description in Chapter 5 ("subtract the out-of-pocket fuel cost... Apply the cash multiplier to the fuel cost and the non-cash multiplier to the rest") is less precise than — and not obviously identical in reimbursement-handling to — the more detailed formula given in the Chapter 15 calculation table. Not necessarily a substantive conflict, but the two passages do not map onto each other with full clarity, and an implementer should verify they intend the same computation.
4. **Finder's Fee formula omits explicit multiplier term.** Every other row in the Chapter 15 calculation table explicitly shows a "× Cash multiplier" or "× Non-Cash multiplier" term; the Finder's Fee row, as extracted from the source text, does not show this term, unlike the structurally similar Sales/Commission row directly above it. This may be a source-document typesetting/formatting omission rather than a deliberate rule (i.e., the multiplier may simply not have rendered in the table's typesetting), but it cannot be resolved without a higher-fidelity look at the original page layout, which was outside the scope of this text-based extraction.

### Missing Information
- No formula for computing the claw-back "difference" amount (Section 14.4).
- No numeric threshold for the de minimis personal-supplies exclusion (Section 9, EDGE-013).
- No numeric threshold for the Series A / breakeven qualifying amount (Section 17).
- No default value for the Loyal Employee months/percentage threshold (CONFIG-013/014) — explicitly left blank in the book's own model contract language.
- No specification of how a "round" of Well funding is bounded/reset as a discrete data object (Section 8, EDGE-025).
- No specification of record retention duration, immutability, or correction/edit authority for audit purposes (Section 21).
- No specification of rounding behavior anywhere in the slice/percentage math (Section 12, EDGE-021).

### Human Decisions Required
(Restated compactly; each item above that is tagged AMBIGUOUS, CONFLICT, or "no formula given" is, by definition, a Human Decision Required item for the eventual C-Transit specification. The highest-priority items, in this extractor's assessment of materiality to correct slice math, are: the royalty/rent-on-departure conflict (Conflict #1); the Series A/freeze threshold (Ambiguity #1); the claw-back formula (Missing Information); and the Loyal Employee default thresholds (Missing Information) — but this prioritization itself is an extraction-stage observation, not a decision, and C-Transit's product owner retains full discretion over sequencing and resolution.)

---

## 25. Human Decisions Required

A consolidated checklist for the product owner, drawn from Section 24 (not repeated in full detail here — see Section 24 for context on each):

1. Define the Series A / "meets foreseeable cash needs" quantitative threshold, if C-Transit wants an automatable Pie-freeze trigger rather than a manual owner-initiated action.
2. Resolve the royalty/rent-on-bad-leaver-departure conflict (Conflict #1) — decide definitively whether royalty and/or rent-in-kind slices are zeroed, frozen-but-continuing, or lost for a bad-leaver departure.
3. Decide whether the 2,000-hours/year constant is a single global setting or configurable per Pie (and whether it should ever vary per participant, e.g., part-time roles — not addressed in the source at all).
4. Decide whether/how the Advisor 200-slices/hour cap and 10-hour precondition are configurable, and the precise mechanics of the 10-hour precondition.
5. Set a numeric de minimis threshold (if desired) for small personal-supplies contributions, replacing the source's "use your best judgment."
6. Decide the claw-back "difference" calculation formula.
7. Decide default(s) — if any — for the Loyal Employee clause (months-based and/or percentage-based), since the source provides none.
8. Decide whether Pie freeze is ever reversible, and if so, the reactivation process and its effect on already-frozen historical ownership percentages.
9. Decide who (what role) is authorized to classify a departure reason, and whether/how that classification can be disputed or appealed.
10. Decide rounding rules for slice counts and ownership percentages.
11. Decide whether over-reimbursement (reimbursed amount exceeding paid/FMV amount) is validated, and if so how.
12. Decide how a Well "round" is bounded as a discrete object, if C-Transit's data model requires this to be explicit (the source treats it informally).
13. Decide record-retention, immutability, and correction-authority policy for audit purposes (source is silent).
14. Decide whether the "sustainable competitive advantage" / "ownable IP" gate for idea royalties, and the idea-advance eligibility test, will be implemented as human-approval gates (most consistent with the source, which treats these as judgment calls) or as some codified rule (which would be a C-Transit invention, not a source rule).
15. Decide the precise Personal Car formula C-Transit will implement, given the Chapter 5 vs. Chapter 15 precision mismatch (Conflict #3).
16. Confirm whether the Finder's Fee calculation should include a multiplier term (Conflict #4) — likely yes, for consistency with every other contribution type, but this should be confirmed against the original book's typeset table if a copy with intact table formatting can be consulted, since the text-extraction process used for this document may have lost formatting/columns from that specific table.

---

## 26. Complete Rules Index

| Rule ID | Category | Rule (short) | Formula/Logic | Inputs | Output | Conditions | Source | Status |
|---|---|---|---|---|---|---|---|---|
| CORE-001 | Core Principle | Reward % = At-Risk % | (principle, not computed) | — | — | Universal | Ch. 3 | Confirmed |
| CORE-002 | Core Formula | Slice conversion | Slices = FMV × Multiplier | FMV, Multiplier | Slices | Universal | Ch. 4 | Confirmed |
| OWN-001 | Ownership | Ownership % | Individual Slices ÷ Total Slices | Slice counts | Ownership % | Recalculated continuously until freeze | Ch. 1, Ch. 4; Legal Issues | Confirmed |
| CONFIG-001 | Config | Non-Cash Multiplier | Constant = 2 (default) | — | — | Configurable, discouraged to change | Ch. 4, Ch. 15 | Confirmed |
| CONFIG-002 | Config | Cash Multiplier | Constant = 4 (default) | — | — | Configurable, discouraged to change | Ch. 4, Ch. 15 | Confirmed |
| CONFIG-003 | Config | Working Hours/Year | Constant = 2000 (default) | — | — | Configurability CONFLICTING between tools | Ch. 6, Ch. 11, Ch. 15 | Potential Conflict |
| CONFIG-004 | Config | Commission Rate | Percent = 10% default (5–10% typical) | — | — | Configurable | Ch. 6, Ch. 15 | Confirmed |
| CONFIG-005 | Config | Royalty Rate | Percent = 5% default | — | — | Configurable | Ch. 6, Ch. 15 | Confirmed |
| CONFIG-006 | Config | Finder's Fee tiers | 5% first $1M + 2.5% rest (recommended) | — | — | Configurable; Retrofit tool simplifies to 1 tier | Ch. 6, Ch. 11, Ch. 15 | Confirmed |
| CONFIG-007 | Config | Currency | Single operating currency, 1:1 | — | — | Configurable; no FX support | Ch. 15 | Confirmed |
| CONFIG-008 | Config | Personal Car Method | Enum: Simple / Split | — | — | Configurable | Ch. 5, Ch. 15 | Confirmed |
| CONFIG-009 | Config | Personal Car Mileage Rate | Example: ~$0.54/mi (jurisdiction/time dependent) | — | — | Configurable | Ch. 5 | Confirmed (example only) |
| CONFIG-010 | Config | Advisor Hourly Cap | 200 slices/hour (recommended) | — | — | Configurability unclear | Ch. 7 | Ambiguous |
| CONFIG-011 | Config | Advisor Min. Hours | 10 hours (recommended) | — | — | Mechanism unclear | Ch. 7 | Ambiguous / Incomplete |
| CONFIG-012 | Config | Contractor Buyout Cap/Window | 200% of base, 1-year window | — | — | Fixed schedule | Ch. 6 | Confirmed |
| CONFIG-013 | Config | Loyal-Employee Months Threshold | Blank / user-set | — | — | No default given | Legal Issues | Missing Info |
| CONFIG-014 | Config | Loyal-Employee Percentage Threshold | Blank / user-set | — | — | No default given | Legal Issues | Missing Info |
| CONFIG-015 | Config | Employee Referral Fee | $250–$500 recommended | — | — | Company decision | Ch. 6 | Confirmed |
| CONFIG-016 | Config | Referral Waiting Period | ≥6 months recommended | — | — | Company decision | Ch. 6 | Confirmed |
| CONFIG-017 | Config | Relocation Distance Threshold | 50 miles | — | — | Fixed rule | Ch. 7 | Confirmed |
| CONFIG-018 | Config | Claw-Back Window | 1 year | — | — | Fixed rule | Ch. 7 | Confirmed |
| CONFIG-019 | Config | Non-Solicitation Period | ~1 year (customary) | — | — | Customary, not hard rule | Ch. 7 | Confirmed (customary) |
| CONFIG-020 | Config | Partner/Vendor Savings Rate | Under 5% (optional) | — | — | Optional company policy | Ch. 6 | Confirmed (optional) |
| CONFIG-021 | Config | Buyout Currency Rate | $1/slice (US recommended) | — | — | Negotiable for voluntary offers | Ch. 7, Ch. 15 | Confirmed |
| TIME-001 | Time | Hourly rate | Salary ÷ 2000 | Salary, Hours/Yr | Hourly rate | — | Ch. 6 | Confirmed |
| TIME-002 | Time | Time slices | ((Salary÷2000)×Hours)×NonCashMult | Salary, Hours | Slices | — | Ch. 15 | Confirmed |
| TIME-003 | Time | Slices/hour metric | HourlyRate×NonCashMult | Hourly rate | Slices/hr | Reference metric only | Ch. 6 | Confirmed |
| CASH-001 | Cash | FMV of spent cash | = Amount Spent | — | FMV | — | Ch. 5 | Confirmed |
| CASH-002 | Cash | Expense slices | (Paid−Reimbursed)×CashMult | Paid, Reimbursed | Slices | Customary-expense test applies | Ch. 5, Ch. 15 | Confirmed |
| EQUIP-001 | Equipment | New equipment slices | (Paid−Reimbursed)×CashMult | Paid, Reimbursed | Slices | — | Ch. 5, Ch. 15 | Confirmed |
| EQUIP-002 | Equipment | Pre-owned <1yr | (Paid−Reimbursed)×NonCashMult | Paid, Reimbursed | Slices | Uses purchase price | Ch. 5, Ch. 15 | Confirmed |
| EQUIP-003 | Equipment | Pre-owned ≥1yr | (Resale−Reimbursed)×NonCashMult | Resale value | Slices | Uses resale/FMV | Ch. 5, Ch. 15 | Confirmed |
| WELL-001 | Well | Withdrawal slice allocation | (Withdrawal×Owner%)×CashMult per contributor | Withdrawal, Well ownership % | Slices per contributor | Ownership % at time of withdrawal, not deposit | Ch. 5, Ch. 15 | Confirmed |
| IDEA-001 | Ideas | FMV of idea royalty | RoyaltyRate×AttributableRevenue | Rate, Revenue | FMV | Must be qualifying/ownable idea | Ch. 6 | Confirmed |
| IDEA-002 | Ideas | Idea royalty slices | (FMV−CashPaid)×NonCashMult | FMV, Cash paid | Slices | Structural parity inferred from Ch.15 Sales row | Ch. 15 (inferred) | Confirmed (inferred formula) |
| SALES-001 | Sales | FMV of commission | Revenue×CommissionRate | Revenue, Rate | FMV | Must be responsible closer | Ch. 6 | Confirmed |
| SALES-002 | Sales | Commission slices | ((Rev×Rate)−CashPaid)×NonCashMult | Revenue, Rate, Cash paid | Slices | — | Ch. 15 | Confirmed |
| FINDER-001 | Finder's Fee | FMV of finder's fee | (First $1M×5%)+(Rest×2.5%) | Amount raised | FMV | One fee per investment | Ch. 6 | Confirmed |
| FINDER-002 | Finder's Fee | Finder's fee slices (as tabulated) | (Amt<Cutoff×PreRate)+(Amt>Cutoff×PostRate) | Amount raised, tiers | Slices(?) | Multiplier term not shown in source table | Ch. 15 | Incomplete Spec |
| FACILITY-001 | Facilities | FMV of space | Market rent for space used | Market rate | FMV | Only space actually used | Ch. 6 | Confirmed |
| FACILITY-002 | Facilities | Facilities slices | (FMV−CashPaid)×NonCashMult | FMV, Cash paid | Slices | Documented change from original book (previously unmultiplied) | Ch. 15; Appendix | Confirmed |
| CAR-001 | Personal Car | Simple method slices | (FMV−Reimbursed)×ChosenMult | FMV, Reimbursed | Slices | Company-selected multiplier | Ch. 5, Ch. 15 | Confirmed |
| CAR-002 | Personal Car | Split method slices | Fuel×CashMult + Wear×NonCashMult | Fuel cost, Miles, Rate, Reimbursed | Slices | More accurate, more tracking burden | Ch. 15 | Confirmed (precision mismatch vs Ch.5 — see Conflict #3) |
| OTHER-001 | Other | Bonus/other slices | Amount×(CashMult OR NonCashMult) | Amount, chosen type | Slices | Discretionary | Ch. 15 | Confirmed |
| BUYOUT-001 | Recovery | Buyout price | Outstanding Slices×CurrencyRate | Slices, Rate | Buyout $ | Rate default $1/slice | Ch. 7 | Confirmed |
| RECOVERY-001 | Recovery | Bad-leaver intangible slices | ×0 (zeroed) | — | Slices=0 | Fired-Good-Reason / Resigned-No-Good-Reason | Ch. 7; Legal Issues | Confirmed |
| RECOVERY-002 | Recovery | Bad-leaver cash/tangible slices | Recalculated ×1 (multiplier removed) | Cash spent | Slices=CashSpent×1 | Fired-Good-Reason / Resigned-No-Good-Reason | Ch. 7; Legal Issues | Confirmed |
| RECOVERY-003 | Recovery | Good-leaver slices (all types) | Retained in full (with multiplier) | — | Slices unchanged | Fired-No-Good-Reason / Resigned-Good-Reason | Ch. 7 | Confirmed |
| RECOVERY-004 | Recovery | Facilities on bad-leaver departure | Lost entirely (treated as intangible) | — | Slices=0 | Contradicts general Rent/Royalty continuation passage | Appendix | Potential Conflict (see Conflict #1) |
| CLAWBACK-001 | Recovery | Claw-back trigger | Higher-value transaction within 1yr of good-leaver buyout | Buyout date, subsequent transaction value | "Pay the difference" (formula undefined) | Good-leaver buyouts only | Ch. 7 | Incomplete Spec |
| FREEZE-001 | Freeze | Freeze trigger | Breakeven (100% FMV paid in cash) OR Series A | Company financials / funding event | PieFrozen state | Series A threshold undefined | Ch. 8 | Confirmed trigger logic / Ambiguous threshold |
| FREEZE-002 | Freeze | Post-freeze ownership | Fixed at freeze-moment ratio | Slice counts at freeze | Terminal ownership % | Reversibility ambiguous | Ch. 8 | Confirmed / Ambiguous reversibility |
| EDGE-001–027 | Edge Cases | See Section 22 register | — | — | — | — | Various | See register |

---

*End of extraction. This document is intended as an intermediate artifact for human review, not as a final C-Transit specification. All items marked AMBIGUOUS, POTENTIAL CONFLICT, or INCOMPLETE SPECIFICATION require an explicit decision from C-Transit before being encoded as software behavior.*
