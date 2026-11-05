"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FormMessage } from "@/components/bits";
import { STATE_OPTIONS } from "@/lib/domain/gst";
import { saveClientAction, type ClientFormState } from "./actions";

export function ClientForm({ id, initial, onDoneHref }: { id: string | null; initial: Record<string, string>; onDoneHref?: "invoice" }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(saveClientAction.bind(null, id), {});
  const router = useRouter();
  const v = state.values && Object.keys(state.values).length ? state.values : initial;
  const e = state.errors;
  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      if (!id && onDoneHref === "invoice" && state.id) router.push(`/invoices/new?client=${state.id}`);
    }
  }, [state, id, onDoneHref, router]);

  const field = (name: string, label: string, props: React.ComponentProps<"input"> = {}, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`c-${name}`}>{label}</Label>
      <Input id={`c-${name}`} name={name} defaultValue={v[name] ?? ""} aria-invalid={!!e?.[name]} className="h-10" {...props} />
      {hint && !e?.[name] ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError error={e?.[name]} />
    </div>
  );

  return (
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Client name", { required: true, autoComplete: "organization" })}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-state_code">State</Label>
          <select id="c-state_code" name="state_code" defaultValue={v.state_code ?? ""} aria-invalid={!!e?.state_code} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm aria-invalid:border-destructive">
            <option value="">Choose a state…</option>
            {STATE_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </select>
          <p className="text-xs text-muted-foreground">The place of supply. It decides CGST + SGST or IGST.</p>
          <FieldError error={e?.state_code} />
        </div>
        {field("gstin", "GSTIN (optional)", { maxLength: 15, autoCapitalize: "characters" })}
        {field("email", "Email (optional)", { type: "email", autoComplete: "email" })}
        {field("phone", "Phone (optional)", { inputMode: "tel", autoComplete: "tel" }, "For one-tap WhatsApp reminders.")}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-address">Billing address (optional)</Label>
        <Textarea id="c-address" name="address" defaultValue={v.address ?? ""} rows={2} />
      </div>
      <FormMessage error={state.error} />
      <div><Button type="submit" disabled={pending} className="h-10">{pending ? "Saving…" : id ? "Save client" : "Add client"}</Button></div>
    </form>
  );
}
