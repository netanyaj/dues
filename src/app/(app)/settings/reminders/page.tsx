import type { Metadata } from "next";
import { STAGE_AT_DAYS, STAGE_LABEL } from "@/lib/domain/status";
import { SettingsForm } from "../settings-form";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";

export const metadata: Metadata = { title: "Reminders" };

export default async function ReminderSettings({ searchParams }: PageProps<"/settings/reminders">) {
  const { initial } = await loadSettings(searchParams);
  return (
    <>
      <SectionHeader title="Reminders" description="Dues tells you when to chase. Claude writes the message, and you send it from your own WhatsApp or email." />
      <div className="mb-4 rounded-xl border bg-card">
        <p className="border-b px-4 py-3 title-4">When Dues suggests a reminder</p>
        <ul className="divide-y">
          {([1, 2, 3] as const).map((s) => (
            <li key={s} className="flex justify-between gap-4 px-4 py-2.5 body-6">
              <span>{STAGE_LABEL[s]}</span>
              <span className="amount text-muted-foreground">{STAGE_AT_DAYS[s]} days after the due date</span>
            </li>
          ))}
        </ul>
        <p className="border-t px-4 py-3 caption-5 text-muted-foreground">Chasing pauses for 2 working days after a client says they&apos;ve paid, so you don&apos;t nag someone who already paid.</p>
      </div>
      <SettingsForm
        section="reminders"
        initial={initial}
        fields={[
          { kind: "select", name: "reminder_channel", label: "Usual channel", options: [["whatsapp", "WhatsApp"], ["email", "Email"]], hint: "Claude writes for this channel unless you ask otherwise." },
          { kind: "textarea", name: "reminder_tone", label: "Tone for Claude (optional)", rows: 2, maxLength: 200, placeholder: "e.g. Friendly, first name basis, mention the project name", hint: "Claude reads this through get_business_profile before it writes a reminder." },
        ]}
      />
    </>
  );
}
