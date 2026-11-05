import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="text-muted-foreground">Last updated 6 Nov 2026.</p>
      <h2>What we store</h2>
      <ul>
        <li>Your email and a password hash (handled by Supabase Auth).</li>
        <li>Your business profile: name, address, GSTIN, PAN, Udyam number, bank and UPI details.</li>
        <li>Your clients, invoices, payments, reminders and a history of changes.</li>
        <li>A fingerprint (SHA-256 hash) of your Claude token, never the token itself, and when Claude last used it.</li>
        <li>Payment reports and fraud reports your clients send from the invoice page.</li>
      </ul>
      <h2>What we don&apos;t store</h2>
      <ul>
        <li>Your Claude chats. Claude sends Dues only the tool calls it makes, such as &ldquo;create this draft&rdquo;.</li>
        <li>Card numbers or bank passwords. Dues has no payment gateway.</li>
      </ul>
      <h2>Who sees it</h2>
      <p>Only you, when logged in. Anyone with an invoice link sees that one invoice, as your client would. Data is stored with Supabase and the app runs on Vercel. We don&apos;t sell data or use it for ads, and there are no AI models inside Dues.</p>
      <h2>Deleting it</h2>
      <p>Settings → Account → Delete account removes everything, and invoice links stop working.</p>
    </>
  );
}
