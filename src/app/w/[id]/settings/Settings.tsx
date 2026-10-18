"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusChip } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { ROLE_LABEL, ROLE_SUMMARY, type Can } from "@/lib/roles.ts";
import { currency } from "@/lib/currencies.ts";
import { formatLongDate, formatShortDate } from "@/lib/dates.ts";
import type { Member, Wedding } from "@/lib/wedding.ts";
import { InviteSheet } from "./InviteSheet";
import { MemberSheet } from "./MemberSheet";
import { WeddingSheet } from "./WeddingSheet";
import { CheckinSheet } from "./CheckinSheet";
import { EmailChoices } from "./EmailChoices";
import { DeleteSheet } from "./DeleteSheet";
import Link from "next/link";
import { CalendarLinks } from "@/components/calendar/CalendarLinks";
import { checkinLabel, checkinSlots, googleCheckinLink, type Checkin } from "@/lib/calendar.ts";
import styles from "./settings.module.css";

export type MyEmails = { reminders: boolean; weekly: boolean };

export function Settings({ wedding, me, members, myEmail, rights, checkin, emails, today, preview }: {
  wedding: Wedding; me: Member; members: Member[]; myEmail: string; rights: Can;
  checkin: Checkin | null; emails: MyEmails; today: string; preview?: boolean;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ kind: "invite" } | { kind: "member"; member: Member } | { kind: "wedding" } | { kind: "checkin" } | { kind: "delete" } | null>(null);
  const close = () => setSheet(null);
  const done = () => { setSheet(null); router.refresh(); };
  const cur = currency(wedding.home_currency);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <h1 className="tn-title">Settings</h1>

      <section id="people" className={styles.section} aria-labelledby="people-h">
        <h2 id="people-h" className="tn-heading">Who can see your wedding</h2>
        <ul className={styles.list}>
          {members.map((m) => (
            <li key={m.id} className={styles.person}>
              <span className={styles.avatar} aria-hidden="true">{m.display_name.charAt(0).toUpperCase()}</span>
              <span className={styles.who}>
                {m.status === "invited" ? <span><StatusChip tone="due">Invited</StatusChip></span> : null}
                <b>{m.display_name}{m.id === me.id ? " (you)" : ""}</b>
                <span className="tn-small tn-muted">
                  {ROLE_LABEL[m.role]} · {ROLE_SUMMARY[m.role]}
                  {m.status === "invited" && m.invite_expires_at ? ` · invite to ${m.invite_email}, open until ${formatShortDate(m.invite_expires_at.slice(0, 10))}` : ""}
                </span>
              </span>
              {rights.managePeople && m.role !== "owner" ? (
                <Button variant="link" size="sm" onClick={() => setSheet({ kind: "member", member: m })} aria-label={`Change ${m.display_name}`}>Change</Button>
              ) : null}
            </li>
          ))}
        </ul>
        {rights.managePeople ? <Button variant="secondary" block onClick={() => setSheet({ kind: "invite" })}>Invite someone</Button> : null}
        {me.role === "planner" ? <p className="tn-small tn-muted">The couple choose who can see the wedding.</p> : null}
      </section>

      <section className={styles.section} aria-labelledby="wedding-h">
        <h2 id="wedding-h" className="tn-heading">Your wedding</h2>
        <div className={styles.rows}>
          <div className={styles.row}><span>{formatLongDate(wedding.wedding_date)} · {wedding.destination}</span></div>
          {wedding.names ? <div className={styles.row}><span>{wedding.names}</span></div> : null}
          <div className={styles.row}><span>Totals shown in {cur ? `${cur.name} (${cur.code})` : wedding.home_currency}</span></div>
          {me.role !== "family" ? (
            <div id="checkin" className={`${styles.row} ${styles.rowEdit}`}>
              <span>Weekly check-in · {checkin ? checkinLabel(checkin) : "not set yet"}</span>
              {rights.editSettings ? <Button variant="link" size="sm" onClick={() => setSheet({ kind: "checkin" })} aria-label="Change the weekly check-in">{checkin ? "Edit" : "Pick a time"}</Button> : null}
            </div>
          ) : null}
        </div>
        {checkin && me.role !== "family" ? (
          <CalendarLinks label="Add the check-in to your calendar" ics={`/w/${wedding.id}/calendar/checkin`}
            google={checkinSlots(checkin, today, wedding.wedding_date).map((slot) => googleCheckinLink(checkin, slot, wedding.id, wedding.names))} />
        ) : null}
        {rights.editSettings ? <Button variant="secondary" block onClick={() => setSheet({ kind: "wedding" })}>Edit your wedding</Button> : null}
      </section>

      <section className={styles.section} aria-labelledby="emails-h">
        <h2 id="emails-h" className="tn-heading">Your emails</h2>
        <EmailChoices weddingId={wedding.id} email={myEmail} reminders={emails.reminders} weekly={emails.weekly} family={me.role === "family"} preview={preview} />
      </section>

      <p className={styles.notice}><b>Please check your information.</b> Tondolo reads documents, converts currencies and suggests actions automatically, and technology can get things wrong. Always check amounts, dates and details against your contracts, invoices and bank statements. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></p>

      <section className={styles.section} aria-labelledby="data-h">
        <h2 id="data-h" className="tn-heading">Your data</h2>
        <a href={preview ? "#" : `/w/${wedding.id}/export`} download className="tn-btn tn-btn-secondary tn-btn-md tn-btn-block">Download a spreadsheet</a>
        <p className="tn-small tn-muted">Everything you can see in Tondolo, in a file that opens in Excel, Numbers or Google Sheets.</p>
        <Button variant="link" block onClick={() => setSheet({ kind: "delete" })}>{rights.deleteWedding ? "Delete everything" : "Delete my account"}</Button>
      </section>

      <section className={styles.section}>
        <p className="tn-small tn-muted">Signed in as {myEmail}</p>
        <Button variant="secondary" block onClick={signOut}>Sign out</Button>
      </section>

      <InviteSheet open={sheet?.kind === "invite"} weddingId={wedding.id} members={members} onClose={close} onInvited={() => router.refresh()} />
      <MemberSheet member={sheet?.kind === "member" ? sheet.member : null} members={members} onClose={close} onDone={done} />
      {sheet?.kind === "checkin" ? <CheckinSheet open weddingId={wedding.id} checkin={checkin} onClose={close} onDone={done} /> : null}
      <WeddingSheet open={sheet?.kind === "wedding"} wedding={wedding} onClose={close} onDone={done} />
      <DeleteSheet open={sheet?.kind === "delete"} mode={rights.deleteWedding ? "wedding" : "account"} weddingId={wedding.id} names={wedding.names} onClose={close} preview={preview} />
    </>
  );
}
