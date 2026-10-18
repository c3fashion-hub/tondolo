import { test } from "node:test";
import assert from "node:assert/strict";
import { can, seatsLeft, firstNameFrom } from "../../src/lib/roles.ts";
import { safeNext } from "../../src/lib/safe-next.ts";

test("matches the roles table in the spec", () => {
  assert.deepEqual(can("owner"), { editSettings: true, managePeople: true, deleteWedding: true, seeNotes: true, seeBudget: true, seeAllPayments: true });
  assert.deepEqual(can("partner"), { editSettings: true, managePeople: true, deleteWedding: false, seeNotes: true, seeBudget: true, seeAllPayments: true });
  assert.deepEqual(can("planner"), { editSettings: false, managePeople: false, deleteWedding: false, seeNotes: false, seeBudget: true, seeAllPayments: true });
  assert.deepEqual(can("family"), { editSettings: false, managePeople: false, deleteWedding: false, seeNotes: false, seeBudget: false, seeAllPayments: false });
});

test("counts seats, with the owner taking a partner seat", () => {
  assert.deepEqual(seatsLeft([{ role: "owner", status: "active" }]), { partner: 1, planner: 1, family: 2 });
  assert.deepEqual(
    seatsLeft([
      { role: "owner", status: "active" }, { role: "partner", status: "invited" }, { role: "planner", status: "active" },
      { role: "family", status: "active" }, { role: "family", status: "removed" },
    ]),
    { partner: 0, planner: 0, family: 1 },
  );
});

test("finds a first name", () => {
  assert.equal(firstNameFrom("Ade & Sam", "x@y.com"), "Ade");
  assert.equal(firstNameFrom("Ade and Sam", "x@y.com"), "Ade");
  assert.equal(firstNameFrom(null, "funmi.dunkwu@example.com"), "Funmi");
  assert.equal(firstNameFrom("  ", "sam@example.com"), "Sam");
});

test("only redirects within Tondolo", () => {
  assert.equal(safeNext("/invite/abc"), "/invite/abc");
  assert.equal(safeNext("https://evil.example"), "/home");
  assert.equal(safeNext("//evil.example"), "/home");
  assert.equal(safeNext("/\\evil.example"), "/home");
  assert.equal(safeNext(null), "/home");
});
