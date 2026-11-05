"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormMessage } from "@/components/bits";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { changePasswordAction, deleteAccountAction, type SectionState } from "../actions";

export function ChangePassword({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<SectionState, FormData>(changePasswordAction, {});
  return (
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6" noValidate>
      <p className="title-4 font-semibold">Change password</p>
      <fieldset disabled={disabled || pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="title-4">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} aria-invalid={!!state.errors?.password} />
          <FieldError error={state.errors?.password} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm" className="title-4">Type it again</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" aria-invalid={!!state.errors?.confirm} />
          <FieldError error={state.errors?.confirm} />
        </div>
      </fieldset>
      <FormMessage ok={state.ok} error={state.error ?? (disabled ? "Turned off on demo accounts." : null)} />
      <div><Button type="submit" variant="outline" disabled={disabled || pending}>{pending ? "Changing…" : "Change password"}</Button></div>
    </form>
  );
}

export function DeleteAccount({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<SectionState, FormData>(deleteAccountAction, {});
  const [typed, setTyped] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:p-6">
      <p className="title-4 font-semibold text-danger">Delete account</p>
      <p className="body-6 text-muted-foreground">Deletes your profile, clients, invoices, payments and reminders for good. Client links stop working. Download your CSV first if you need it for tax.</p>
      <div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive-outline" disabled={disabled}>Delete my account</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <form action={action} className="flex flex-col gap-4">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your Dues account?</AlertDialogTitle>
                <AlertDialogDescription>This can&apos;t be undone. Type DELETE to confirm.</AlertDialogDescription>
              </AlertDialogHeader>
              <Input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" />
              <FieldError error={state.errors?.confirm ?? state.error} />
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Keep my account</AlertDialogCancel>
                <Button type="submit" variant="destructive" disabled={pending || typed.trim().toUpperCase() !== "DELETE"}>{pending ? "Deleting…" : "Delete for good"}</Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
        {disabled && <p className="mt-1.5 caption-5 text-muted-foreground">Turned off on demo accounts.</p>}
      </div>
    </div>
  );
}
