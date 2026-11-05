import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth";
import { appUrl } from "@/lib/service/core";
import { getProfile, setupGaps } from "@/lib/service/profile";
import { ProfileForm } from "./profile-form";
import { McpCard } from "./mcp-card";

export const metadata: Metadata = { title: "Settings · Dues" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const profile = await getProfile(ctx);
  const gaps = setupGaps(profile);
  const welcome = sp.welcome === "1" && gaps.length > 0;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{welcome ? "Set up Dues" : "Settings"}</h1>
        {welcome ? (
          <p className="mt-1 text-muted-foreground">
            About a minute. These details go on every invoice. You can add clients and drafts before finishing; only sending needs this.
          </p>
        ) : sp.connect === "1" ? (
          <p className="mt-1 text-muted-foreground">Saved. Last step: create your Claude link and add it to Claude.</p>
        ) : null}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <ProfileForm
          profile={{
            business_name: profile.business_name ?? "",
            address: profile.address ?? "",
            gstin: profile.gstin ?? "",
            pan: profile.pan ?? "",
            state_code: profile.state_code ?? "",
            default_sac: profile.default_sac ?? "998391",
            upi_id: profile.upi_id ?? "",
            upi_name: profile.upi_name ?? "",
            bank_account_name: profile.bank_account_name ?? "",
            bank_account_number: profile.bank_account_number ?? "",
            bank_ifsc: profile.bank_ifsc ?? "",
            invoice_prefix: profile.invoice_prefix ?? "INV",
            udyam_number: profile.udyam_number ?? "",
            msme_category: profile.msme_category ?? "",
          }}
          welcome={welcome}
        />
        <McpCard hasLink={!!profile.mcp_token_hash} last4={profile.mcp_token_last4} baseUrl={`${appUrl()}/api/mcp/`} isDemo={profile.is_demo} highlight={sp.connect === "1"} />
      </div>
    </div>
  );
}
