"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FormMessage } from "@/components/bits";
import { saveSectionAction, type SectionState } from "./actions";
import type { FormSection } from "./sections";

export type FieldDef =
  | { kind: "text"; name: string; label: string; hint?: string; inputMode?: "numeric" | "text" | "email"; maxLength?: number; caps?: boolean; placeholder?: string }
  | { kind: "textarea"; name: string; label: string; hint?: string; rows?: number; maxLength?: number; placeholder?: string }
  | { kind: "select"; name: string; label: string; hint?: string; options: [string, string][]; placeholder?: string }
  | { kind: "toggle"; name: string; label: string; hint?: string }
  | { kind: "group"; title: string; description?: string; fields: FieldDef[] };

type Values = Record<string, string>;

function Field({ f, values, errors, hidden }: { f: Exclude<FieldDef, { kind: "group" }>; values: Values; errors?: Record<string, string>; hidden?: boolean }) {
  const err = errors?.[f.name];
  const describedBy = err ? `${f.name}-err` : f.hint ? `${f.name}-hint` : undefined;
  if (hidden) return <input type="hidden" name={f.name} value="" />;
  if (f.kind === "toggle") {
    return (
      <div className="flex items-start gap-3">
        <input id={f.name} name={f.name} type="checkbox" defaultChecked={values[f.name] !== "false"} className="mt-0.5 size-5 shrink-0 accent-[#171717]" aria-describedby={describedBy} />
        <div>
          <Label htmlFor={f.name} className="title-4">{f.label}</Label>
          {f.hint && <p id={`${f.name}-hint`} className="caption-5 text-muted-foreground">{f.hint}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={f.name} className="title-4">{f.label}</Label>
      {f.kind === "text" && (
        <Input id={f.name} name={f.name} defaultValue={values[f.name]} aria-invalid={!!err} aria-describedby={describedBy} inputMode={f.inputMode} maxLength={f.maxLength}
          autoCapitalize={f.caps ? "characters" : undefined} placeholder={f.placeholder} />
      )}
      {f.kind === "textarea" && (
        <Textarea id={f.name} name={f.name} defaultValue={values[f.name]} rows={f.rows ?? 3} maxLength={f.maxLength} aria-invalid={!!err} aria-describedby={describedBy} placeholder={f.placeholder} />
      )}
      {f.kind === "select" && (
        <select id={f.name} name={f.name} defaultValue={values[f.name]} aria-invalid={!!err} aria-describedby={describedBy} className="h-10 rounded-lg border border-input bg-card px-3 text-base aria-invalid:border-destructive md:text-sm">
          {f.placeholder != null && <option value="">{f.placeholder}</option>}
          {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
      {f.hint && !err ? <p id={`${f.name}-hint`} className="caption-5 text-muted-foreground">{f.hint}</p> : null}
      <FieldError id={`${f.name}-err`} error={err} />
    </div>
  );
}

export function SettingsForm({ section, fields, initial, next, welcome, gstToggle = false, footer, locked }: {
  section: FormSection; fields: FieldDef[]; initial: Values; next?: string; welcome?: boolean; gstToggle?: boolean; footer?: ReactNode; locked?: string;
}) {
  const [state, action, pending] = useActionState<SectionState, FormData>(saveSectionAction.bind(null, section), {});
  const router = useRouter();
  const values = state.values ? { ...initial, ...state.values } : initial;
  const [gstOn, setGstOn] = useState(!!initial.gstin);
  const e = state.errors;

  useEffect(() => {
    if (!state.ok) return;
    toast.success("Saved");
    if (welcome && next) router.push(`${next}?welcome=1`);
  }, [state, welcome, next, router]);

  const render = (f: FieldDef, i: number): ReactNode => {
    if (f.kind === "group") {
      return (
        <fieldset key={i} className="flex flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0 sm:col-span-2">
          <div>
            <legend className="title-4 font-semibold">{f.title}</legend>
            {f.description && <p className="mt-0.5 body-6 text-muted-foreground">{f.description}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">{f.fields.map(render)}</div>
        </fieldset>
      );
    }
    const wide = f.kind === "textarea" || f.kind === "toggle";
    return <div key={f.name} className={wide ? "sm:col-span-2" : ""}><Field f={f} values={values} errors={e} hidden={gstToggle && !gstOn && f.name === "gstin"} /></div>;
  };

  return (
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-6 rounded-xl border bg-card p-5 sm:p-6" noValidate>
      {gstToggle && (
        <div className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
          <input id="gst_registered" name="gst_registered" type="checkbox" checked={gstOn} onChange={(ev) => setGstOn(ev.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#171717]" />
          <div>
            <Label htmlFor="gst_registered" className="title-4">I&apos;m GST registered</Label>
            <p className="caption-5 text-muted-foreground">Turn this off if you&apos;re not registered. Invoices then say &ldquo;GST not applicable&rdquo; and add no tax.</p>
          </div>
        </div>
      )}
      <fieldset disabled={!!locked || pending} className="contents">
        <div className="grid gap-4 sm:grid-cols-2">{fields.map(render)}</div>
      </fieldset>
      {footer}
      <FormMessage error={state.error ?? locked} />
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="submit" disabled={pending || !!locked}>{pending ? "Saving…" : welcome && next ? "Save and continue" : "Save changes"}</Button>
        {welcome && next && <p className="caption-5 text-muted-foreground">You can change any of this later.</p>}
      </div>
    </form>
  );
}
