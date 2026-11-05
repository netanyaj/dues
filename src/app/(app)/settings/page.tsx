import { redirect } from "next/navigation";

export default async function SettingsIndex({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  if (sp.welcome === "1") redirect("/settings/business?welcome=1");
  if (sp.connect === "1") redirect("/settings/claude?welcome=1");
  redirect("/settings/business");
}
