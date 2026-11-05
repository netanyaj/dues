import { mailtoLink, waPhone, whatsappLink } from "@/lib/domain/upi";
import { check, cleanText, db, DuesError, logEvent, type Ctx } from "./core";
import { assertAllowed, findInvoice, publicUrl, type InvoiceRow, type ReminderRow } from "./invoices";
import { getProfile } from "./profile";

export function reminderLink(inv: InvoiceRow, businessName: string | null, r: Pick<ReminderRow, "channel" | "message">) {
  if (r.channel === "whatsapp") return whatsappLink(inv.client_phone, r.message);
  return mailtoLink(inv.client_email, `Invoice ${inv.number ?? ""} from ${businessName ?? ""}`.trim(), r.message);
}

/** Claude writes the message; Dues stores it and returns a one-tap link. Dues never sends anything. */
export async function saveReminder(ctx: Ctx, ref: string, input: { message?: string | null; channel?: string | null }) {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "save_reminder");
  const message = cleanText(input.message, 2000);
  if (!message) throw new DuesError("invalid_input", "Write the reminder message to save.", "message");
  const channel = (input.channel ?? "whatsapp").toLowerCase();
  if (channel !== "whatsapp" && channel !== "email") throw new DuesError("invalid_input", `channel must be "whatsapp" or "email" (got "${input.channel}").`, "channel");

  const warnings: string[] = [];
  if (channel === "whatsapp" && !waPhone(inv.client_phone)) warnings.push(`${inv.client_name} has no phone number saved, so the WhatsApp link will ask which chat to send it to. Add their phone with upsert_client for a direct link.`);
  if (channel === "email" && !inv.client_email) warnings.push(`${inv.client_name} has no email saved, so you'll need to fill in the recipient. Add it with upsert_client.`);
  const link = publicUrl(inv.public_id);
  if (link && !message.includes(link)) warnings.push(`The message doesn't include the invoice link (${link}). Consider adding it so the client can pay in one tap.`);

  const reminder = check(
    await db().from("reminders").insert({ invoice_id: inv.id, user_id: ctx.userId, message, channel, created_by: ctx.actor === "claude" ? "claude" : "user" }).select("*").single(),
  ) as ReminderRow;
  await logEvent(ctx, inv.id, "reminder_saved", { channel, reminder_id: reminder.id });
  const profile = await getProfile(ctx);
  return { reminder, invoice: inv, link: reminderLink(inv, profile.business_name, reminder), warnings };
}

export async function markReminderSent(ctx: Ctx, reminderId: string) {
  const r = check(await db().from("reminders").update({ sent_marked_at: new Date().toISOString() }).eq("id", reminderId).eq("user_id", ctx.userId).is("sent_marked_at", null).select("invoice_id, channel")) as { invoice_id: string; channel: string }[];
  if (r[0]) await logEvent(ctx, r[0].invoice_id, "reminder_sent", { channel: r[0].channel, reminder_id: reminderId });
}
