// Who can do what. The database enforces all of this; the app uses it to show the right buttons.
export type Role = "owner" | "partner" | "planner" | "family";
export type MemberStatus = "invited" | "active" | "removed";

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", partner: "Partner", planner: "Planner", family: "Family" };

export const ROLE_SUMMARY: Record<Role, string> = {
  owner: "everything, plus billing",
  partner: "everything",
  planner: "adds payments, can't see your notes",
  family: "sees overall progress and their own contribution",
};

export const ROLE_INVITE_HELP: Record<Exclude<Role, "owner">, string> = {
  partner: "Sees and changes everything, and can invite people.",
  planner: "Sees and adds payments and the budget. Can't see your notes or change settings.",
  family: "Sees overall progress and the payments they're covering, nothing else.",
};

export type Can = {
  editSettings: boolean;
  managePeople: boolean;
  deleteWedding: boolean;
  seeNotes: boolean;
  seeBudget: boolean;
  seeAllPayments: boolean;
};

export function can(role: Role): Can {
  const couple = role === "owner" || role === "partner";
  return {
    editSettings: couple,
    managePeople: couple,
    deleteWedding: role === "owner",
    seeNotes: couple,
    seeBudget: role !== "family",
    seeAllPayments: role !== "family",
  };
}

// Seats per wedding: two partners (the owner is one of them), one planner, two family members.
const SEATS: Record<Exclude<Role, "owner">, number> = { partner: 2, planner: 1, family: 2 };

export function seatsLeft(members: { role: Role; status: MemberStatus }[]): Record<Exclude<Role, "owner">, number> {
  const taken = (r: Role) =>
    members.filter((m) => m.status !== "removed" && (r === "partner" ? m.role === "partner" || m.role === "owner" : m.role === r)).length;
  return {
    partner: Math.max(0, SEATS.partner - taken("partner")),
    planner: Math.max(0, SEATS.planner - taken("planner")),
    family: Math.max(0, SEATS.family - taken("family")),
  };
}

// A friendly first name for the person who created the wedding.
export function firstNameFrom(names: string | null, email: string): string {
  const fromNames = (names ?? "").split(/\s*(?:&|\+|\band\b|,)\s*/i)[0]?.trim();
  if (fromNames) return fromNames.slice(0, 60);
  const local = email.split("@")[0].split(/[._+-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1, 60) : "You";
}
