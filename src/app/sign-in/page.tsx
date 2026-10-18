import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server.ts";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { user } = await currentUser();
  if (user) redirect("/home");
  return (
    <main className="tn-page">
      <Link href="/" className="tn-back">‹ Back</Link>
      <Mark size={48} />
      <div className="tn-stack">
        <h1 className="tn-title">Sign in</h1>
        <p className="tn-muted">Use the email you saved your wedding with, or the one you were invited with.</p>
      </div>
      {error ? <p className="tn-alert" role="alert">That sign-in link has expired or was already used. Ask for a new code below.</p> : null}
      <SignInForm />
    </main>
  );
}
