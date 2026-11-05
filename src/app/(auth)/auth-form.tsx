"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
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
  const [show, setShow] = useState(false);
  const isLogin = mode === "login";
  return (
    <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <Link href="/" aria-label="Dues home"><Logo /></Link>
        <h1 className="mt-8 heading-6">{isLogin ? "Log in" : "Create your account"}</h1>
        <p className="mt-1 body-6 text-muted-foreground">
          {isLogin ? "Welcome back." : "Free. About 30 seconds, then you connect Claude."}
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-4 rounded-xl border bg-card p-5" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="title-4">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} aria-invalid={!!state.error} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="title-4">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? undefined : 8}
              aria-invalid={!!state.error}
              aria-describedby={isLogin ? undefined : "pw-hint"}
              className="pr-11"
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground">
              {show ? <EyeSlashIcon className="size-5" /> : <EyeIcon className="size-5" />}
            </button>
          </div>
          {!isLogin && <p id="pw-hint" className="caption-5 text-muted-foreground">At least 8 characters.</p>}
        </div>
        {state.error && (
          <p role="alert" className="rounded-lg border border-[#fecdca] bg-late-soft px-3 py-2 body-6 text-late">{state.error}</p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (isLogin ? "Logging in…" : "Creating account…") : isLogin ? "Log in" : "Create account"}
        </Button>
        {!isLogin && (
          <p className="caption-5 text-muted-foreground">
            By creating an account you agree to the <Link href="/terms" className="underline underline-offset-2">terms</Link>. We store your email, business and invoice details, and nothing from your Claude chats. <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>.
          </p>
        )}
      </form>
      <p className="body-6 text-muted-foreground">
        {isLogin ? (
          <>New to Dues? <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Log in</Link></>
        )}
      </p>
    </main>
  );
}
