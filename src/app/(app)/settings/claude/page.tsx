import type { Metadata } from "next";
import { CheckIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/domain/dates";
import { mcpServerUrl } from "@/lib/service/profile";
import { ConnectSteps, McpCard } from "../mcp-card";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";

export const metadata: Metadata = { title: "Claude connection" };

const CAN = [
  "Read your business profile, defaults and reminder tone",
  "Add clients and fill in missing details (never overwrite)",
  "Create and edit drafts; Dues computes every rupee",
  "Mark a draft ready for you to send",
  "Note a payment you mention, for you to confirm",
  "Write and save reminders, and read what's owed",
];
const CANT = [
  "Send an invoice or give it a number",
  "Confirm or reject a payment",
  "Change totals, tax or a sent invoice",
  "Delete or cancel anything",
  "See other people's data or make a new token",
];

export default async function ClaudeSettings({ searchParams }: PageProps<"/settings/claude">) {
  const { profile, welcome } = await loadSettings(searchParams);
  const serverUrl = mcpServerUrl();
  const status = !profile.mcp_token_hash ? "Not connected yet" : profile.mcp_last_used_at ? `Connected · last used ${formatDateTime(profile.mcp_last_used_at)}` : "Token created · not used yet";
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        step={welcome ? "Step 4 of 4 · last step" : undefined}
        title="Claude connection"
        description="Connect your own Claude so you can say who to invoice in plain words. Claude drafts; Dues checks the numbers; you send."
      />
      <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 body-5">
        <span aria-hidden className={`size-2 rounded-full ${profile.mcp_last_used_at ? "bg-paid" : "bg-[#a3a3a3]"}`} />
        {status}
      </div>
      <McpCard serverUrl={serverUrl} hasToken={!!profile.mcp_token_hash} last4={profile.mcp_token_last4} isDemo={profile.is_demo} />
      <ConnectSteps serverUrl={serverUrl} />
      {welcome && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-5">
          <p className="min-w-0 flex-1 body-6">That&apos;s setup done. You can connect Claude later from this page.</p>
          <Button asChild><Link href="/dashboard">Go to your dashboard</Link></Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <p className="title-4 font-semibold">Claude can</p>
          <ul className="mt-2 flex flex-col gap-1.5 body-6">{CAN.map((c) => <li key={c} className="flex gap-2"><CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-paid" weight="bold" />{c}</li>)}</ul>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="title-4 font-semibold">Only you can, in Dues</p>
          <ul className="mt-2 flex flex-col gap-1.5 body-6">{CANT.map((c) => <li key={c} className="flex gap-2"><XIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" weight="bold" />{c}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
