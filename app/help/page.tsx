// ============================================================
// Execution Tracker — How to use this system
// ============================================================
// The manual. Written for the people who will actually use this: a
// founder who is not a programmer, and a team who has never seen a
// Slicing Pie before.
//
// Two rules govern the writing:
//
//   1. Plain language, always. If a sentence needs a second reading, it
//      is the sentence that is wrong. Where a term is unavoidable it is
//      defined on the spot and again in the glossary at the bottom.
//   2. Say who can do each thing. The system deliberately keeps the Pie
//      from team members (decision D1) — that is a feature, not a
//      limitation, and the manual should make it feel like one.
//
// Readable by anyone signed in. Only an administrator can actually
// perform the admin actions, and each one is labelled.
// ============================================================

import { requireAuth } from "@/lib/auth";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Clock,
  PieChart,
  ShieldCheck,
  Settings,
  Wallet,
  UserMinus,
  Calculator,
  AlertTriangle,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

/** A labelled section, so the manual has a scannable shape. */
function Section({
  id,
  icon: Icon,
  title,
  audience,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  audience?: "Admin only" | "Everyone";
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{title}</h2>
        {audience && (
          <Badge variant="outline" className="text-[10px] uppercase">
            {audience}
          </Badge>
        )}
      </div>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/** A question with its answer, for the parts people get stuck on. */
function QA({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <p className="font-medium">{q}</p>
      <div className="mt-1 space-y-2 text-muted-foreground">{children}</div>
    </div>
  );
}

/** The contents list, so the page is usable rather than scrolled. */
const CONTENTS = [
  { id: "what", label: "What this is" },
  { id: "members", label: "If you are on the team" },
  { id: "setup", label: "Setting up a Pie" },
  { id: "contributions", label: "Recording contributions" },
  { id: "payday", label: "Payday" },
  { id: "well", label: "The Well" },
  { id: "leaving", label: "When someone leaves" },
  { id: "settings", label: "Changing the rules" },
  { id: "proof", label: "Proving the numbers" },
  { id: "maths", label: "How the maths works" },
  { id: "wrong", label: "When something looks wrong" },
  { id: "glossary", label: "Words used here" },
];

export default async function HelpPage() {
  const user = await requireAuth();
  const isAdmin = user.role === "admin";

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <BookOpen className="h-7 w-7" />
          How to use this system
        </h1>
        <p className="mt-2 text-muted-foreground">
          A guide to the whole system, in the order you will actually need it.
          Nothing here assumes you have used anything like it before.
        </p>
      </div>

      {/* Contents */}
      <Card>
        <CardContent className="py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            On this page
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {CONTENTS.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="text-sm underline-offset-4 hover:underline">
                  {c.label}
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------- */}
      <Section id="what" icon={HelpCircle} title="What this is">
        <p>
          This is a way of splitting ownership of a company by what people
          actually put in — money they spent, work they did without pay,
          equipment they lent — rather than by a number someone guessed at the
          start.
        </p>
        <p>
          Nobody gets a fixed percentage. Everyone earns{" "}
          <strong>slices</strong>, and your share is your slices divided by
          everybody&apos;s slices. If someone else contributes more, your
          percentage goes down — not because anything was taken from you, but
          because the Pie got bigger. That is the whole idea, and it is
          supposed to feel that way.
        </p>
        <p>
          Work that is paid for is not a contribution. The system only counts
          what is <em>at risk</em>: money and effort you put in and have not
          been paid back for.
        </p>
      </Section>

      {/* ---------------------------------------------------- */}
      <Section
        id="members"
        icon={Clock}
        title="If you are on the team"
        audience="Everyone"
      >
        <p className="font-medium text-foreground">Log your hours at My Time</p>
        <p>
          Every day or week you work, log the hours at{" "}
          <strong>My Time</strong>. Say what you did and how long it took.
          Logged hours are not slices yet — they sit as{" "}
          <em>waiting for payday</em> until an administrator runs payday, which
          turns them into slices.
        </p>
        <p>
          Be honest and be specific. These entries become the record of what you
          contributed, so a vague entry is a weak claim later.
        </p>

        <p className="pt-2 font-medium text-foreground">
          See your own numbers at My Slices
        </p>
        <p>
          <strong>My Slices</strong> shows your side of the Pie and nothing
          else: how many slices you have, what percentage of the company that
          is, where the slices came from, how much value you have put in that
          nobody has paid back yet, and the individual entries behind all of it.
        </p>
        <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You cannot see anyone else&apos;s numbers, and they cannot see
            yours. Only an administrator sees the whole Pie. If you want to
            check something, look at your own page first — if it still seems
            wrong, ask, and the administrator can show you exactly which entries
            make up your figure.
          </span>
        </p>
      </Section>

      {/* ---------------------------------------------------- */}
      {isAdmin && (
        <Section
          id="setup"
          icon={PieChart}
          title="Setting up a Pie"
          audience="Admin only"
        >
          <p className="font-medium text-foreground">1. Create the Pie</p>
          <p>
            At <strong>Slicing Pie → new Pie</strong>. Give it a name. It gets
            a currency (Naira by default) and that currency is fixed for the
            life of the Pie — you cannot mix currencies in one Pie.
          </p>

          <p className="pt-2 font-medium text-foreground">2. Add the people</p>
          <p>
            Each person needs a role — owner, executive, employee, advisor or
            contractor — and a status. Only <em>active</em> people earn new
            slices; the others keep what they have already earned.
          </p>

          <p className="pt-2 font-medium text-foreground">
            3. Set each person&apos;s fair-market salary
          </p>
          <p>
            This is the number that turns their hours into slices, so it matters
            more than anything else on the setup screen. It is{" "}
            <strong>not</strong> what you pay them — it is what you would have
            to pay a stranger to do that job. Set it high and the person earns
            slices fast.
          </p>
          <p>
            Set it per person, from the Pie dashboard. You can change it later,
            and the change only affects hours logged after the change — hours
            already converted keep the salary that was in force when they were
            logged.
          </p>

          <p className="pt-2 font-medium text-foreground">
            4. Do not set the rules yet
          </p>
          <p>
            The defaults are sensible and follow the standard Slicing Pie
            method. Change them only when you have a reason — see{" "}
            <a href="#settings" className="underline">
              Changing the rules
            </a>
            .
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------- */}
      {isAdmin && (
        <Section
          id="contributions"
          icon={Wallet}
          title="Recording contributions"
          audience="Admin only"
        >
          <p>
            Anything someone puts in that they have not been paid back for is a
            contribution. Record it from the Pie dashboard, and pick the right
            kind — there are eighteen, and the kind decides the multiplier:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
            <li>
              <strong>Money and property</strong> (expenses, equipment, cash):
              counted at <strong>four times</strong> its value. Money is the
              hardest thing to give up, so it earns the most.
            </li>
            <li>
              <strong>Work and time</strong> (hours, contractor time, advisor
              time): counted at <strong>twice</strong> its value.
            </li>
            <li>
              <strong>Royalties and rent</strong> (idea royalties, facilities):
              also <strong>twice</strong>.
            </li>
          </ul>
          <p>
            Before you save anything, the form shows you a preview: the cash
            value, the multiplier, and the exact number of slices it will
            create. Read it. It is much easier to correct a number before it is
            written than after.
          </p>
          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              There is a separate kind for a <strong>payment out</strong> of the
              Pie to a person. That one <em>removes</em> slices, because being
              paid back means the money is no longer at risk. Recording a
              payment as an ordinary expense would give the person slices for
              money they already got back.
            </span>
          </p>

          <p className="pt-2 font-medium text-foreground">
            Put evidence on the big ones
          </p>
          <p>
            Each entry can carry a note and a link to a receipt. For anything
            large, do it. The value of this system is that it can be defended
            later, and a receipt is the cheapest defence there is.
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------- */}
      {isAdmin && (
        <Section
          id="payday"
          icon={Calculator}
          title="Payday — turning hours into slices"
          audience="Admin only"
        >
          <p>
            Hours logged at My Time do not become slices on their own. Run{" "}
            <strong>payday</strong> when you want to convert them — monthly is
            the usual rhythm.
          </p>
          <p>
            Payday takes every hour logged and not yet converted, works out what
            each person&apos;s time was worth (their hours at their fair-market
            salary), multiplies it, and writes one ledger entry per person. It
            then marks those hours as converted so they are never counted twice.
          </p>
          <p>
            You can run payday as often as you like. Running it twice in a day
            converts only what is new, so nothing is double-counted.
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------- */}
      {isAdmin && (
        <Section
          id="well"
          icon={Wallet}
          title="The Well — shared cash"
          audience="Admin only"
        >
          <p>
            The Well is money that belongs to the company and has not been
            assigned to anyone. Put money in, and take it out when you spend it.
          </p>
          <p>
            The important part: when you take money <em>out</em> of the Well,
            the slices it removes are taken from <strong>everyone</strong> who
            owns the Well, in proportion to what they own — not from whoever
            triggered the payment.
          </p>
          <p className="text-muted-foreground">
            That is because the money was shared property. Spending shared
            property reduces everyone&apos;s stake, and the system does that
            automatically. Doing it any other way would let whoever spends the
            money decide whose equity it costs.
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------- */}
      {isAdmin && (
        <Section
          id="leaving"
          icon={UserMinus}
          title="When someone leaves"
          audience="Admin only"
        >
          <p>
            This is the feature to be careful with, and the one built most
            defensively. Open the departure panel on the Pie dashboard, choose
            the person and say what happened.
          </p>
          <p>
            <strong>Nothing is written until you confirm.</strong> The tool
            shows you first: exactly how many slices the person keeps, exactly
            how many go back to the Pie, and the exact ledger entries it is
            about to add. Read that screen — it is the last chance to notice a
            wrong number.
          </p>
          <p>
            When you confirm, nothing is ever deleted or overwritten. New
            entries are <em>added</em> that adjust the old ones, and both stay
            visible forever. That is what makes the outcome defensible if the
            person disputes it.
          </p>
          <p className="pt-2 font-medium text-foreground">
            The four situations, and what each means
          </p>
          <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
            <li>
              <strong>Good leaver</strong> — left in good standing. Keeps the
              slices they earned; the rest goes back to the Pie.
            </li>
            <li>
              <strong>Bad leaver</strong> — broke the agreement. Royalty and
              rent slices are <strong>frozen</strong> rather than deleted, so
              the decision is recorded rather than quietly reversed.
            </li>
            <li>
              <strong>Advisor terminating early</strong> — an advisor who
              accepted the hourly slice cap cannot be dismissed without cause.
              If they are, they keep their slices.
            </li>
            <li>
              <strong>Buyout</strong> — you pay the person for their slices and
              they leave with cash instead of equity.
            </li>
          </ul>
          <p>
            Whatever you have already paid someone is accounted for
            automatically. Paying a person ₦100,000 and then recording their
            departure will not pay them twice for the same money.
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------- */}
      {isAdmin && (
        <Section
          id="settings"
          icon={Settings}
          title="Changing the rules"
          audience="Admin only"
        >
          <p>
            Every rule in the system is editable from the Settings screen:
            multipliers, caps, minimum hours, warning thresholds, all of it.
            Each change asks why you are making it and keeps a dated record of
            who changed what.
          </p>
          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Changes only apply going forward.</strong> Every
              contribution remembers the rules that were in force when it was
              written, and is never recalculated under new ones. So changing a
              multiplier today does not silently alter last year&apos;s
              numbers — the history stays exactly as it was agreed.
            </span>
          </p>
          <p>
            Practically: change a rule when the situation genuinely changes
            (you start paying advisors, say), and leave it alone otherwise. A
            rule changed often is a rule that will be hard to defend.
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------- */}
      {isAdmin && (
        <Section
          id="proof"
          icon={ShieldCheck}
          title="Proving the numbers"
          audience="Admin only"
        >
          <p>
            Inside each Pie there is a <strong>Records &amp; proof</strong>{" "}
            page. It exists for the moment someone asks you to justify an
            ownership figure. It does three things:
          </p>
          <p className="pt-1 font-medium text-foreground">
            1. Re-checks every entry
          </p>
          <p>
            It recalculates each entry from the inputs and rules stored on that
            entry, and tells you whether the figure comes back the same. If
            anything does not, it shows you which entry and by how much — that
            would be a defect in the tool, not a judgement call.
          </p>
          <p className="pt-1 font-medium text-foreground">
            2. Shows ownership on any past date
          </p>
          <p>
            Pick a date and see who owned what on that day, rebuilt from the
            entries up to that point. A departure recorded in June does not
            change what ownership looked like in May.
          </p>
          <p className="pt-1 font-medium text-foreground">
            3. Downloads the history
          </p>
          <p>
            A spreadsheet of every entry — for an accountant, or for reading
            yourself — and a complete data file of everything in the Pie, for
            keeping. Both are generated fresh each time, so there is no stale
            copy to worry about.
          </p>
          <p>
            There is also a button that asks the database to try to edit one
            entry, and shows you the refusal. It is there so you can check for
            yourself, rather than take our word for it, that the history cannot
            be altered.
          </p>
        </Section>
      )}

      {/* ---------------------------------------------------- */}
      <Section id="maths" icon={Calculator} title="How the maths works">
        <p>
          Three steps, every time, for every kind of contribution:
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            <strong>Work out the cash value.</strong> An expense of ₦50,000 has
            a value of ₦50,000. Ten hours at a fair-market salary of ₦12m/year
            is worth ₦60,000 (at 2,000 working hours a year).
          </li>
          <li>
            <strong>Multiply it.</strong> Cash and property ×4. Work and effort
            ×2. Royalties and rent ×2.
          </li>
          <li>
            <strong>That is the slices.</strong> ₦50,000 of expenses is
            50,000 × 4 = <strong>200,000 slices</strong>.
          </li>
        </ol>
        <p className="pt-1 font-medium text-foreground">
          And then your share
        </p>
        <p>
          Your share is <em>your slices ÷ all the slices in the Pie</em>. That
          is what My Slices shows you, and it is the number that will end up
          being a percentage of the company.
        </p>
        <p className="pt-1 font-medium text-foreground">
          Why slices are not money
        </p>
        <p>
          A slice has no cash value until the company is sold, or someone pays
          to buy slices. Until then it is a share of a promise. Do not present
          slices to anyone as though they were cash.
        </p>
      </Section>

      {/* ---------------------------------------------------- */}
      <Section
        id="wrong"
        icon={AlertTriangle}
        title="When something looks wrong"
      >
        <div className="space-y-3">
          <QA q="My slices went down and I did nothing wrong.">
            <p>
              This is usually not an error. Your percentage goes down whenever
              somebody else contributes more, because the Pie grew. Your own
              slice count only falls when you are paid back for something, or
              when a correction is recorded against one of your entries.
            </p>
            <p>
              Check the entry list at the bottom of My Slices. Anything that
              reduced your total appears there as its own line, marked as a
              correction.
            </p>
          </QA>

          <QA q="My hours are logged but I have no slices for them.">
            <p>
              Logged hours only become slices when an administrator runs
              payday. My Slices shows how many of your hours are still{" "}
              <em>waiting for payday</em>.
            </p>
          </QA>

          <QA q="I entered something with the wrong amount.">
            <p>
              Tell an administrator. Nothing is edited or deleted — a
              correcting entry is added that reverses the difference, and both
              the original and the correction stay in the record. That is
              deliberate: the history is more trustworthy when it shows its own
              mistakes.
            </p>
          </QA>

          <QA q="Records & proof says an entry didn't recalculate.">
            <p>
              That means the tool produced a figure that does not match the rule
              it says produced it. Do not try to fix it by editing anything —
              the ledger will refuse. Take the entry reference shown on that
              page and get it looked at, because a real disagreement between the
              rule and the record is the one thing this system is built to
              prevent.
            </p>
          </QA>

          <QA q="Someone is disputing their ownership figure.">
            <p>
              Open Records &amp; proof, pick the date in question, and download
              the ledger. It shows every entry, what each was based on, and the
              running totals. Show them that, not a percentage on its own — the
              percentages are the conclusion, and the entries are the argument.
            </p>
          </QA>
        </div>
      </Section>

      {/* ---------------------------------------------------- */}
      <Section id="glossary" icon={BookOpen} title="Words used here">
        <dl className="space-y-3">
          {[
            [
              "Slice",
              "The unit of ownership this system counts. You earn slices for contributions. Your percentage is your slices divided by all the slices.",
            ],
            [
              "At risk",
              "Value you have put in that you have not been paid back for. Only at-risk value earns slices — this is the central idea of the whole method.",
            ],
            [
              "Multiplier",
              "How many slices each unit of value earns. Cash and property are ×4; work, royalties and rent are ×2; things that are neither earn none.",
            ],
            [
              "FMV (fair market value)",
              "What something would cost to buy from a stranger. For work, it is what you would have to pay someone to do that job — used to turn hours into money before the multiplier.",
            ],
            [
              "Cap table",
              "The list of who owns how much. The Pie dashboard is the cap table.",
            ],
            [
              "The Well",
              "Shared cash belonging to the company that has not been assigned to anyone. Withdrawals reduce everyone's slices in proportion.",
            ],
            [
              "Payday",
              "The action that converts logged hours into slices. Until it is run, logged hours are a promise, not equity.",
            ],
            [
              "Correction",
              "An added entry that changes the effective value of an earlier one. Earlier entries are never edited or removed.",
            ],
            [
              "Frozen",
              "A Pie that has been locked, usually at a funding round. Ownership stops changing and the figures at that moment are kept.",
            ],
            [
              "Minor units",
              "Money stored in the smallest unit — for Naira, kobo. ₦1 is 100. This is why exported spreadsheets show whole numbers.",
            ],
          ].map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          {isAdmin ? (
            <p>
              You are signed in as an administrator, so every section above
              applies to you.
            </p>
          ) : (
            <p>
              You are signed in as a team member. The sections marked{" "}
              <Badge variant="outline" className="text-[10px] uppercase">
                Admin only
              </Badge>{" "}
              describe what an administrator does with the Pie — they are here
              so you can see how your own figures are arrived at.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
