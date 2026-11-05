"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FormMessage } from "@/components/bits";
import { STATE_OPTIONS } from "@/lib/domain/gst";
import { saveProfileAction, type ProfileState } from "./actions";

type Values = Record<string, string>;

function Field({ name, label, hint, values, errors, ...rest }: {
  name: string; label: string; hint?: string; values: Values; errors?: Record<string, string>;
} & React.ComponentProps<"input">) {
  const err = errors?.[name];
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={values[name]} aria-invalid={!!err} aria-describedby={err ? `${name}-err` : hint ? `${name}-hint` : undefined} className="h-10" {...rest} />
      {hint && !err ? <p id={`${name}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError id={`${name}-err`} error={err} />
    </div>
  );
}

export function ProfileForm({ profile, welcome }: { profile: Values; welcome: boolean }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});
  const router = useRouter();
  const [onboarding] = useState(welcome); // remember: the page stops being "welcome" once saved
  const values = state.values ?? profile;
  const e = state.errors;

  useEffect(() => {
    if (state.ok) {
      toast.success("Profile saved");
      if (onboarding) router.push("/settings?connect=1#connect");
    }
  }, [state, onboarding, router]);

  return (
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-8" noValidate>
      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Your business</h2>
        <Field name="business_name" label="Business or trading name" values={values} errors={e} required autoComplete="organization" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" name="address" defaultValue={values.address} rows={3} aria-invalid={!!e?.address} aria-describedby={e?.address ? "address-err" : undefined} />
          <FieldError id="address-err" error={e?.address} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="state_code">State</Label>
          <select
            id="state_code"
            name="state_code"
            defaultValue={values.state_code}
            aria-invalid={!!e?.state_code}
            className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm aria-invalid:border-destructive"
          >
            <option value="">Choose your state…</option>
            {STATE_OPTIONS.map(([code, name]) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Decides whether invoices charge CGST + SGST (same state) or IGST.</p>
          <FieldError error={e?.state_code} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="gstin" label="GSTIN (optional)" hint="Leave blank if you're not GST-registered. Invoices will say “GST not applicable”." values={values} errors={e} autoCapitalize="characters" maxLength={15} />
          <Field name="pan" label="PAN (optional)" hint="Filled in from your GSTIN if you have one." values={values} errors={e} autoCapitalize="characters" maxLength={10} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium">How clients pay you</h2>
          <p className="text-sm text-muted-foreground">Add a bank account, a UPI ID, or both. Bank details are shown first on invoices; UPI is offered for totals up to ₹1,00,000.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="bank_account_name" label="Account holder name" values={values} errors={e} />
          <Field name="bank_account_number" label="Account number" values={values} errors={e} inputMode="numeric" />
          <Field name="bank_ifsc" label="IFSC" values={values} errors={e} autoCapitalize="characters" maxLength={11} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="upi_id" label="UPI ID" hint="e.g. yourname@okicici" values={values} errors={e} autoCapitalize="none" />
          <Field name="upi_name" label="Name shown in UPI apps" values={values} errors={e} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Invoice defaults</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="invoice_prefix" label="Invoice number prefix" hint="1–3 letters or digits. Numbers look like INV/2026–27/0001." values={values} errors={e} maxLength={3} autoCapitalize="characters" />
          <Field name="default_sac" label="Default SAC code" hint="998391 is specialty design services. Change it per line if needed." values={values} errors={e} inputMode="numeric" maxLength={8} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium">MSME registration (optional)</h2>
          <p className="text-sm text-muted-foreground">If you&apos;re a registered micro or small enterprise, invoices state your rights under the MSMED Act. Dues checks the format only.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="udyam_number" label="Udyam registration number" hint="e.g. UDYAM-KR-03-0012345" values={values} errors={e} autoCapitalize="characters" maxLength={22} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msme_category">Enterprise category</Label>
            <select id="msme_category" name="msme_category" defaultValue={values.msme_category} aria-invalid={!!e?.msme_category} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm aria-invalid:border-destructive">
              <option value="">Choose…</option>
              <option value="micro">Micro</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
            </select>
            <p className="text-xs text-muted-foreground">As on your Udyam certificate. The late-payment rules cover micro and small only.</p>
            <FieldError error={e?.msme_category} />
          </div>
        </div>
      </section>

      <FormMessage error={state.error} />
      <div>
        <Button type="submit" disabled={pending} className="h-10 px-5">{pending ? "Saving…" : onboarding ? "Save and continue" : "Save changes"}</Button>
      </div>
    </form>
  );
}
