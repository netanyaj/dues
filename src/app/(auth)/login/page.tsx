import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { login } from "../actions";

export const metadata: Metadata = { title: "Log in · Dues" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <AuthForm mode="login" action={login} next={next} />;
}
