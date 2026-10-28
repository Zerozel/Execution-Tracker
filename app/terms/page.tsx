// ============================================================
// Execution Tracker — Terms & Conditions page
// ============================================================
// Server Component. Loads the current terms text from disk and the
// user's acceptance state. Renders the read-only text and hands off
// to the client component for the acceptance flow.
//
// If the user has already accepted the current version, this page
// shows a "you have accepted" summary instead of the acceptance form.
// ============================================================

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getTermsStatus, termsVersionLabel } from "@/lib/terms";
import { TermsAcceptance } from "@/components/terms-acceptance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CheckCircle2, FileText, ArrowLeft } from "lucide-react";

async function loadTermsText(): Promise<string> {
  const path = join(process.cwd(), "content", "terms", "v1.0.md");
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    console.error("Failed to read terms text:", err);
    return "# Terms text not found\n\nPlease contact the administrator.";
  }
}

// Extremely light markdown rendering. The terms text is trusted
// (committed to the repository), so this is a display concern only.
// For headings, bold, list markers, and horizontal rules.
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  let inList = false;
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${key++}`} className="list-disc pl-6 space-y-1 my-3">
          {listBuffer.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
    inList = false;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("- ")) {
      inList = true;
      listBuffer.push(line.slice(2));
      continue;
    }
    if (inList) flushList();

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${key++}`} className="text-2xl font-bold mt-6 mb-3">
          {line.slice(2)}
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${key++}`} className="text-xl font-semibold mt-6 mb-2">
          {line.slice(3)}
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${key++}`} className="text-lg font-semibold mt-4 mb-2">
          {line.slice(4)}
        </h3>
      );
      continue;
    }
    if (line === "---") {
      elements.push(<hr key={`hr-${key++}`} className="my-6 border-t" />);
      continue;
    }
    if (!line) {
      elements.push(<div key={`br-${key++}`} className="h-2" />);
      continue;
    }

    // Paragraph with inline bold (**text**).
    const parts: React.ReactNode[] = [];
    let rest = line;
    let partIdx = 0;
    while (true) {
      const start = rest.indexOf("**");
      if (start === -1) {
        if (rest) parts.push(rest);
        break;
      }
      const end = rest.indexOf("**", start + 2);
      if (end === -1) {
        parts.push(rest);
        break;
      }
      if (start > 0) parts.push(rest.slice(0, start));
      parts.push(
        <strong key={partIdx++}>{rest.slice(start + 2, end)}</strong>
      );
      rest = rest.slice(end + 2);
    }

    elements.push(
      <p key={`p-${key++}`} className="my-2 leading-relaxed">
        {parts}
      </p>
    );
  }
  if (inList) flushList();

  return <div className="text-sm">{elements}</div>;
}

export default async function TermsPage() {
  const user = await requireAuth();
  const status = await getTermsStatus(user.id);
  const termsText = await loadTermsText();

  // If accepted, show a completion summary.
  if (status.accepted) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <FileText className="h-7 w-7" />
            Terms & Conditions
          </h1>
          <p className="mt-1 text-muted-foreground">{termsVersionLabel()}</p>
        </div>

        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-6 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">
                You have accepted this version of the terms
              </p>
              {status.accepted_at && (
                <p className="text-sm text-green-700 mt-1">
                  Accepted on{" "}
                  {new Date(status.accepted_at).toLocaleString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
              <p className="text-sm text-green-700 mt-2">
                Physical signature:{" "}
                {status.physical_signed ? (
                  <Badge
                    variant="outline"
                    className="bg-green-100 text-green-700 border-green-300 text-xs"
                  >
                    On file
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-amber-100 text-amber-700 border-amber-300 text-xs"
                  >
                    Outstanding
                  </Badge>
                )}
              </p>
              {!status.physical_signed && (
                <p className="text-xs text-green-700 mt-2">
                  Remember to sign and return the physical copy to the
                  administrator. Digital acceptance is not a substitute for
                  your physical signature.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Full text</CardTitle>
          </CardHeader>
          <CardContent>{renderMarkdown(termsText)}</CardContent>
        </Card>
      </div>
    );
  }

  // Not accepted. Show the acceptance flow.
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <FileText className="h-7 w-7" />
          Terms & Conditions
        </h1>
        <p className="mt-1 text-muted-foreground">{termsVersionLabel()}</p>
        <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          You must accept these terms to use Execution Tracker. Read the full
          text below, then complete the three-step confirmation at the bottom.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The full agreement</CardTitle>
        </CardHeader>
        <CardContent>{renderMarkdown(termsText)}</CardContent>
      </Card>

      <TermsAcceptance
        currentStepsCompleted={status.steps_completed}
        stepsRequired={status.steps_required}
      />
    </div>
  );
}
