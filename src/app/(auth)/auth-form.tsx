"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: (s: AuthState, fd: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <div>
        <Link href="/" className="text-lg font-semibold tracking-tight">Dues</Link>
        <h1 className="mt-6 text-2xl font-semibold">{isLogin ? "Log in" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLogin ? "Welcome back." : "Free to try. Takes 30 seconds, then connect Claude."}
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} aria-invalid={!!state.error} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? undefined : 8}
            aria-invalid={!!state.error}
            aria-describedby={isLogin ? undefined : "pw-hint"}
            className="h-10"
          />
          {!isLogin && <p id="pw-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>}
        </div>
        {state.error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? (isLogin ? "Logging in…" : "Creating account…") : isLogin ? "Log in" : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {isLogin ? (
          <>New to Dues? <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">Create account</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Log in</Link></>
        )}
      </p>
    </div>
  );
}
