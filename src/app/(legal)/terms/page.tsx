import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <>
      <h1>Terms</h1>
      <p className="text-muted-foreground">Last updated 6 Nov 2026. Dues is an early product built as a demo.</p>
      <h2>What Dues does</h2>
      <p>Dues helps you make GST invoices, share a payment page with your client and keep track of what you&apos;re owed. Money moves directly between your client and your bank or UPI account. Dues never holds or moves money.</p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>The business, tax and bank details you enter are correct and yours.</li>
        <li>You check every invoice before you send it. Dues computes the tax, but you are the supplier on the invoice.</li>
        <li>You don&apos;t use Dues to bill for anything you didn&apos;t supply, or to pretend to be another business.</li>
      </ul>
      <h2>Limits</h2>
      <p>Dues checks the format of GSTINs, PANs and Udyam numbers, not whether they are active. It doesn&apos;t verify businesses or bank accounts. Free accounts can hold up to 50 invoices. We may suspend accounts reported for fraud.</p>
      <h2>No warranty</h2>
      <p>Dues is provided as is. Keep your own records and export a CSV for your accountant regularly.</p>
    </>
  );
}
