import type { Metadata } from "next";
import { istToday } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";

export const metadata: Metadata = { title: "Data and export" };

export default async function DataSettings({ searchParams }: PageProps<"/settings/data">) {
  const { profile } = await loadSettings(searchParams);
  const today = istToday();
  const fyStart = Number(today.slice(5, 7)) >= 4 ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Data and export" description="Your invoices are yours. Export them any time." />
      <form action="/api/export" method="get" className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <div>
          <p className="title-4 font-semibold">CSV for your CA</p>
          <p className="mt-0.5 body-6 text-muted-foreground">One row per invoice sent in the range: number, dates, client GSTIN, taxable value, CGST, SGST, IGST, total, TDS, received and balance. Opens in Excel or Google Sheets.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="from" className="title-4">From</Label><Input id="from" type="date" name="from" defaultValue={fyStart} required /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="to" className="title-4">To</Label><Input id="to" type="date" name="to" defaultValue={today} max={today} required /></div>
        </div>
        <div><Button type="submit">Download CSV</Button></div>
      </form>
      {profile.is_demo && (
        <div className="rounded-xl border bg-card p-5 body-6">
          <p className="title-4 font-semibold">Demo data</p>
          <p className="mt-0.5 text-muted-foreground">This account was filled with sample invoices in every state. Reviewers share it, so please don&apos;t delete the samples. To start from empty, create your own account.</p>
        </div>
      )}
    </div>
  );
}
