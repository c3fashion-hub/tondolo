import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server.ts";
import { ROLE_INVITE_HELP, type Role } from "@/lib/roles.ts";
import { formatLongDate } from "@/lib/dates.ts";
import { AcceptInvite } from "./AcceptInvite";

export const metadata: Metadata = { title: "You're invited", robots: { index: false } };

type Invite = { names: string | null; destination: string; wedding_date: string; role: Exclude<Role, "owner">; display_name: string; invited_by_name: string | null; email_hint: string };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user } = await currentUser();
  const { data } = await supabase.rpc("peek_invite", { p_token: token });
  const invite = (data as Invite[] | null)?.[0];

  if (!invite) {
    return (
      <main className="tn-page">
        <Mark size={48} />
        <h1 className="tn-title">This invite has expired</h1>
        <p className="tn-muted">Invite links work once and last 14 days. Ask whoever invited you to send a new one.</p>
        <Link href="/sign-in" className="tn-back">Already joined? Sign in</Link>
      </main>
    );
  }

  const wedding = invite.names ? `${invite.names}’s wedding` : "a wedding";
  return (
    <main className="tn-page">
      <Mark size={48} />
      <div className="tn-stack">
        <h1 className="tn-title">You&rsquo;re invited, {invite.display_name}</h1>
        <p>
          {invite.invited_by_name ?? "The couple"} has invited you to {wedding} in {invite.destination}, {formatLongDate(invite.wedding_date)}.
        </p>
      </div>
      <section className="tn-card">
        <h2 className="tn-heading">You&rsquo;ll join as {invite.role === "family" ? "family" : `the ${invite.role}`}</h2>
        <p className="tn-muted">{ROLE_INVITE_HELP[invite.role]}</p>
      </section>
      <AcceptInvite token={token} signedInEmail={user?.email ?? null} emailHint={invite.email_hint} />
    </main>
  );
}
