import type { Metadata } from "next";
import { SignOutIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { logout } from "../../../(auth)/actions";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";
import { ChangePassword, DeleteAccount } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountSettings({ searchParams }: PageProps<"/settings/account">) {
  const { ctx, profile } = await loadSettings(searchParams);
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Account" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5 sm:p-6">
        <div><p className="caption-4 text-muted-foreground">Signed in as</p><p className="title-4">{ctx.email}</p></div>
        <form action={logout}><Button type="submit" variant="outline"><SignOutIcon aria-hidden />Log out</Button></form>
      </div>
      <ChangePassword disabled={profile.is_demo} />
      <DeleteAccount disabled={profile.is_demo} />
    </div>
  );
}
