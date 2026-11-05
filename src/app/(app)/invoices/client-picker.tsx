"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { Dialog as D, Popover } from "radix-ui";
import { CaretUpDownIcon, CheckIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATE_OPTIONS, stateName } from "@/lib/domain/gst";
import { cn } from "@/lib/utils";
import { createClientInlineAction } from "../clients/actions";
import type { FormClient } from "./invoice-form";

/** D36: searchable client dropdown. "+ New client" opens a side panel and comes back with it selected. */
export function ClientPicker({ clients, value, onChange, invalid }: { clients: FormClient[]; value: string; onChange: (id: string, added?: FormClient) => void; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState(false);
  const listId = useId();
  const selected = clients.find((c) => c.id === value);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? clients.filter((c) => c.name.toLowerCase().includes(s) || (c.gstin ?? "").toLowerCase().includes(s)) : clients;
  }, [clients, q]);
  const [active, setActive] = useState(0);
  const pick = (id: string) => { onChange(id); setOpen(false); setQ(""); };
  const total = shown.length + 1; // + New client

  return (
    <>
      <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); setActive(0); }}>
        <Popover.Trigger asChild>
          <button id="client" type="button" aria-haspopup="listbox" aria-expanded={open}
            className={cn("flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left body-6", invalid && "border-destructive")}>
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.name : "Choose a client"}</span>
            <CaretUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 rounded-xl border bg-popover p-1 shadow-lg">
            <div className="flex items-center gap-2 border-b px-2 pb-1">
              <MagnifyingGlassIcon aria-hidden className="size-4 text-muted-foreground" />
              <input
                autoFocus value={q} placeholder="Search clients" aria-label="Search clients" role="combobox" aria-controls={listId} aria-expanded aria-activedescendant={`${listId}-${active}`}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % total); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + total) % total); }
                  else if (e.key === "Enter") { e.preventDefault(); if (active < shown.length) pick(shown[active].id); else { setOpen(false); setPanel(true); } }
                }}
                className="h-9 w-full bg-transparent body-6 outline-none"
              />
            </div>
            <ul id={listId} role="listbox" aria-label="Clients" className="max-h-64 overflow-y-auto py-1">
              {shown.map((c, i) => (
                <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={c.id === value}
                  onMouseEnter={() => setActive(i)} onClick={() => pick(c.id)}
                  className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 body-6", i === active && "bg-muted")}>
                  <CheckIcon aria-hidden className={cn("size-4 shrink-0", c.id === value ? "text-brand" : "invisible")} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="caption-5 text-muted-foreground">{stateName(c.state_code)}</span>
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-2 caption-5 text-muted-foreground">No client matches “{q}”.</li>}
              <li id={`${listId}-${shown.length}`} role="option" aria-selected={false}
                onMouseEnter={() => setActive(shown.length)} onClick={() => { setOpen(false); setPanel(true); }}
                className={cn("mt-1 flex cursor-pointer items-center gap-2 rounded-lg border-t px-3 py-2 body-6 font-medium text-brand", active === shown.length && "bg-muted")}>
                <PlusIcon aria-hidden className="size-4" /> New client{q ? `: ${q}` : ""}
              </li>
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <NewClientPanel open={panel} onOpenChange={setPanel} defaultName={q} onCreated={(c) => { onChange(c.id, c); setQ(""); }} />
    </>
  );
}

function NewClientPanel({ open, onOpenChange, defaultName, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; defaultName: string; onCreated: (c: FormClient) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const field = (name: string, label: string, opts: { required?: boolean; hint?: string; inputMode?: "email" | "tel" } = {}) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`nc-${name}`}>{label}{opts.required ? "" : <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
      <Input id={`nc-${name}`} name={name} defaultValue={name === "name" ? defaultName : ""} inputMode={opts.inputMode} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `nc-${name}-e` : undefined} className="h-10" />
      {errors[name] ? <p id={`nc-${name}-e`} role="alert" className="caption-4 text-destructive">{errors[name]}</p> : opts.hint ? <p className="caption-5 text-muted-foreground">{opts.hint}</p> : null}
    </div>
  );
  return (
    <D.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setErrors({}); setMsg(null); } }}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-6 overflow-y-auto border-l bg-card p-6 shadow-xl outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <D.Title className="heading-6">New client</D.Title>
              <D.Description className="mt-1 body-6 text-muted-foreground">Name and state are enough. Their state decides CGST + SGST or IGST.</D.Description>
            </div>
            <D.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><XIcon /></Button></D.Close>
          </div>
          <form
            ref={form}
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const v = Object.fromEntries(["name", "state_code", "gstin", "email", "phone"].map((k) => [k, String(fd.get(k) ?? "").trim()]));
              const local: Record<string, string> = {};
              if (!v.name) local.name = "Enter the client's name.";
              if (!v.state_code) local.state_code = "Choose their state.";
              setErrors(local); setMsg(null);
              if (Object.keys(local).length) return;
              start(async () => {
                const r = await createClientInlineAction(v as { name: string; state_code: string });
                if (r.ok) { onCreated(r.client); onOpenChange(false); }
                else { setErrors(r.errors); setMsg(r.error ?? null); }
              });
            }}
          >
            {field("name", "Client name", { required: true })}
            <div className="flex flex-col gap-2">
              <Label htmlFor="nc-state_code">State</Label>
              <select id="nc-state_code" name="state_code" defaultValue="" aria-invalid={!!errors.state_code} className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 body-6 aria-invalid:border-destructive">
                <option value="">Choose…</option>
                {STATE_OPTIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
              {errors.state_code && <p role="alert" className="caption-4 text-destructive">{errors.state_code}</p>}
            </div>
            {field("gstin", "GSTIN", { hint: "If they're GST registered. Checked for format and state." })}
            {field("email", "Email", { inputMode: "email" })}
            {field("phone", "Phone", { inputMode: "tel", hint: "For the WhatsApp share link." })}
            {msg && <p role="alert" className="body-6 text-destructive">{msg}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add and select"}</Button>
              <D.Close asChild><Button type="button" variant="outline">Cancel</Button></D.Close>
            </div>
          </form>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
