import { PageHeader } from "@/components/ds";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="These details appear on every invoice and tell Claude your defaults." />
      <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
