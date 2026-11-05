"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/bits";
import { Banner } from "@/components/ds";
import { regenerateTokenAction } from "./actions";

export const TRY_PROMPT =
  "Invoice Acme Corp in Bengaluru, Karnataka for 12 hours of design at ₹2,500/hr with 18% GST, due in 15 days.";

function Code({ children, testId }: { children: string; testId?: string }) {
  return <code data-testid={testId} className="block min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">{children}</code>;
}

/** D25 + D28: the token is shown once, after creating it. Afterwards only its last 4 characters. */
export function McpCard({ serverUrl, hasToken, last4, isDemo }: { serverUrl: string; hasToken: boolean; last4: string | null; isDemo: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const create = () =>
    start(async () => {
      const r = await regenerateTokenAction();
      setOpen(false);
      if (r.ok) { setFresh(r.token); toast.success("Your token is ready. Copy it now."); }
      else toast.error(r.error);
    });

  const header = fresh ? `Bearer ${fresh}` : null;
  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <p className="title-4">Server URL</p>
        <div className="flex items-center gap-2"><Code>{serverUrl}</Code><CopyButton value={serverUrl} label="Copy" /></div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="title-4">Token</p>
        {fresh ? (
          <>
            <Banner tone="warning" title="Copy it now. For your security, Dues can't show it again.">Anyone with this token can create drafts and read your invoices, so don&apos;t share it.</Banner>
            <div className="flex items-center gap-2"><Code testId="mcp-token">{fresh}</Code><CopyButton value={fresh} label="Copy" /></div>
            <p className="mt-2 title-4">Header value</p>
            <div className="flex items-center gap-2"><Code>{header!}</Code><CopyButton value={`Authorization: ${header}`} label="Copy header" variant="default" /></div>
            <p className="caption-5 text-muted-foreground">&ldquo;Copy header&rdquo; copies the full line, <span className="font-mono">Authorization: Bearer …</span>, for Claude Code.</p>
          </>
        ) : hasToken ? (
          <>
            <Code>{`••••••••••••••••${last4 ?? ""}`}</Code>
            <p className="caption-5 text-muted-foreground">Only the last 4 characters are kept on screen. Dues stores a fingerprint of the token, not the token. Lost it? Make a new one; the old one stops working at once.</p>
          </>
        ) : (
          <div><Button onClick={create} disabled={pending}>{pending ? "Creating…" : "Create my Claude token"}</Button></div>
        )}
      </div>

      {hasToken && !fresh && (
        <div>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={isDemo || pending}>{pending ? "Making a new token…" : "Regenerate token"}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Make a new token?</AlertDialogTitle>
                <AlertDialogDescription>Your current token stops working straight away. Claude loses access to Dues until you paste the new one into the connector.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep current token</AlertDialogCancel>
                <AlertDialogAction onClick={(ev) => { ev.preventDefault(); create(); }}>Make a new token</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {isDemo ? <p className="mt-1.5 caption-5 text-muted-foreground">Turned off on demo accounts, so the shared demo token keeps working for every reviewer.</p> : null}
        </div>
      )}
    </div>
  );
}

export function ConnectSteps({ serverUrl }: { serverUrl: string }) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <p className="title-4 font-semibold">Claude on the web (claude.ai) and Claude Desktop</p>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 body-6">
          <li>Go to <b>Customize → Connectors</b>.</li>
          <li>Click <b>+ Add</b>, then <b>Add custom connector</b>.</li>
          <li>Name it <b>Dues</b> and paste the server URL. Click <b>Continue</b>, then <b>Continue</b> again.</li>
          <li>Under <b>Authentication</b>, choose <b>No sign in</b>.</li>
          <li>Under <b>Request headers</b>, add the name <span className="font-mono">Authorization</span> and the value <span className="font-mono">Bearer</span> followed by a space and your token.</li>
          <li>Click <b>Add</b>. In a new chat, check Dues is switched on in the tools menu.</li>
        </ol>
        <p className="mt-2 caption-5 text-muted-foreground">Connectors you add on claude.ai also appear in Claude Desktop. On Team and Enterprise plans an Owner may need to add it under organisation settings. If you don&apos;t see Request headers, your account doesn&apos;t have that option yet; use Claude Code below.</p>
      </div>
      <div>
        <p className="title-4 font-semibold">Claude Code</p>
        <div className="mt-2 flex items-start gap-2">
          <Code>{`claude mcp add --transport http dues ${serverUrl} --header "Authorization: Bearer <token>"`}</Code>
        </div>
        <p className="mt-1 caption-5 text-muted-foreground">Replace &lt;token&gt; with your token.</p>
      </div>
      <div>
        <p className="title-4 font-semibold">Then try</p>
        <blockquote className="mt-2 rounded-lg bg-muted px-3 py-2 body-6">&ldquo;{TRY_PROMPT}&rdquo;</blockquote>
      </div>
    </div>
  );
}
