import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server.ts";
import { SaveWithEmail } from "./SaveWithEmail";

export const metadata: Metadata = { title: "Save your wedding" };

export default async function SavePage() {
  const { user } = await currentUser();
  if (user) redirect("/save/finish");
  return (
    <main className="tn-page">
      <Link href="/" className="tn-back">‹ Change your answers</Link>
      <Mark size={48} />
      <div className="tn-stack">
        <h1 className="tn-title">Save your wedding</h1>
        <p className="tn-muted">Add your email so your wedding is kept in your account, on any phone, and you can share it with your partner later.</p>
      </div>
      <SaveWithEmail />
    </main>
  );
}
