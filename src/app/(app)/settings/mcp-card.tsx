"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/bits";
import { regenerateLinkAction } from "./actions";

export const TRY_PROMPT =
  "Set up my client Acme Corp, Bengaluru, Karnataka, then invoice them for 12 hours of design at ₹2,500/hr with 18% GST, due in 15 days.";

export function ConnectSteps({ url }: { url?: string }) {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
      <li>In Claude, go to <b>Customize → Connectors</b>.</li>
      <li>Click <b>+ Add</b>, then <b>Add custom connector</b>.</li>
      <li>Name it <b>Dues</b> and paste {url ? "the link above" : "your Dues link"} as the server URL. Click <b>Continue</b>.</li>
      <li>Under Authentication, choose <b>No sign in</b> (the link itself is your key), then click <b>Add</b>.</li>
      <li>In a new chat, open the tools menu, check <b>Dues</b> is switched on, and try:
        <blockquote className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">“{TRY_PROMPT}”</blockquote>
      </li>
    </ol>
  );
}

export function McpCard({ url, isDemo }: { url: string; isDemo: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <aside className="flex h-fit flex-col gap-4 rounded-lg border p-5">
      <div>
        <h2 className="font-medium">Connect Claude</h2>
        <p className="mt-1 text-sm text-muted-foreground">This is your private link. Anyone with it can create invoices in your account, so don&apos;t share it.</p>
      </div>
      <div className="flex flex-col gap-2">
        <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs" data-testid="mcp-url">{url}</code>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={url} label="Copy link" variant="default" />
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isDemo || pending} title={isDemo ? "Disabled on demo accounts — sign up to try it." : undefined}>
                {pending ? "Regenerating…" : "Regenerate link"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate your Claude link?</AlertDialogTitle>
                <AlertDialogDescription>
                  The current link stops working straight away. Any Claude that uses it loses access until you add the new link.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep current link</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(ev) => {
                    ev.preventDefault();
                    start(async () => {
                      const r = await regenerateLinkAction();
                      setOpen(false);
                      if (r.ok) toast.success("New link created. Update it in Claude.");
                      else toast.error(r.error ?? "Couldn't regenerate the link.");
                    });
                  }}
                >
                  Regenerate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {isDemo ? <p className="text-xs text-muted-foreground">Regenerate is disabled on demo accounts — sign up to try it.</p> : null}
      </div>
      <ConnectSteps url={url} />
      <p className="text-xs text-muted-foreground">
        Works on Claude Free (one custom connector), Pro, Max, Team and Enterprise. On Team and Enterprise, an organisation Owner adds it under Organization settings → Connectors.
      </p>
    </aside>
  );
}
