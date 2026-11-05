"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/bits";
import { cn } from "@/lib/utils";
import { regenerateLinkAction } from "./actions";

export const TRY_PROMPT =
  "Invoice Acme Corp in Bengaluru, Karnataka for 12 hours of design at ₹2,500/hr with 18% GST, due in 15 days.";

export function ConnectSteps() {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
      <li>In Claude, go to <b>Customize → Connectors</b>.</li>
      <li>Click <b>+ Add</b>, then <b>Add custom connector</b>.</li>
      <li>Name it <b>Dues</b> and paste your Dues link as the server URL. Click <b>Continue</b>.</li>
      <li>Under Authentication, choose <b>No sign in</b> (the link itself is your key), then click <b>Add</b>.</li>
      <li>In a new chat, open the tools menu, check <b>Dues</b> is switched on, and try:
        <blockquote className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">“{TRY_PROMPT}”</blockquote>
      </li>
    </ol>
  );
}

/** D25: the full link is shown once (after creating it). Afterwards only the last 4 characters. */
export function McpCard({ hasLink, last4, baseUrl, isDemo, highlight }: { hasLink: boolean; last4: string | null; baseUrl: string; isDemo: boolean; highlight: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const create = () =>
    start(async () => {
      const r = await regenerateLinkAction();
      setOpen(false);
      if (r.ok) { setFresh(r.url); toast.success("Your Claude link is ready. Copy it now."); }
      else toast.error(r.error);
    });

  return (
    <aside id="connect" className={cn("flex h-fit flex-col gap-4 rounded-lg border p-5", highlight && !hasLink && "border-2 border-primary")}>
      <div>
        <h2 className="font-medium">Connect Claude</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your private link lets your Claude create drafts and read your invoices. Anyone with it can do the same, so don&apos;t share it.</p>
      </div>

      {fresh ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-950">Copy this now — for security we can&apos;t show it again.</p>
          <code className="block break-all rounded bg-white px-2 py-1.5 text-xs" data-testid="mcp-url">{fresh}</code>
          <CopyButton value={fresh} label="Copy link" variant="default" />
        </div>
      ) : hasLink ? (
        <div className="flex flex-col gap-1">
          <code className="block rounded-md bg-muted px-3 py-2 text-xs">{baseUrl}••••••••{last4}</code>
          <p className="text-xs text-muted-foreground">For security, the full link is shown only once. Lost it? Regenerate a new one.</p>
        </div>
      ) : (
        <Button onClick={create} disabled={pending} className="h-10">{pending ? "Creating…" : "Create my Claude link"}</Button>
      )}

      {hasLink && !fresh && (
        <div>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isDemo || pending}>{pending ? "Regenerating…" : "Regenerate link"}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate your Claude link?</AlertDialogTitle>
                <AlertDialogDescription>The current link stops working straight away. Any Claude that uses it loses access until you add the new link.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep current link</AlertDialogCancel>
                <AlertDialogAction onClick={(ev) => { ev.preventDefault(); create(); }}>Regenerate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {isDemo ? <p className="mt-1 text-xs text-muted-foreground">Disabled on demo accounts — sign up to try it.</p> : null}
        </div>
      )}

      <ConnectSteps />
      <p className="text-xs text-muted-foreground">
        Claude can create and edit drafts, add clients, save reminders and note payments for you to confirm. It can&apos;t send invoices or confirm payments; you do that here. Works on Claude Free (one custom connector), Pro, Max, Team and Enterprise. On Team and Enterprise, an organisation Owner adds it under Organization settings → Connectors.
      </p>
    </aside>
  );
}
