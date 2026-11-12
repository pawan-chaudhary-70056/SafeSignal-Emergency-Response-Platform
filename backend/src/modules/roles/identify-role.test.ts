import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { identifyRole } from "./identify-role.js";
import { ROLES, ROLE_DASHBOARD_PATHS } from "./role.constants.js";

describe("identifyRole", () => {
  it("identifies every canonical role and its dashboard", () => {
    for (const role of ROLES) {
      const result = identifyRole({ role });

      assert.equal(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.equal(result.role, role);
      assert.equal(result.dashboardPath, ROLE_DASHBOARD_PATHS[role]);
    }
  });

  it("accepts the Prisma role relation shape", () => {
    const result = identifyRole({ role: { name: "DISPATCHER" } });

    assert.deepEqual(result, {
      ok: true,
      role: "DISPATCHER",
      dashboardPath: "/dispatcher/dashboard",
    });
  });

  it("normalizes casing, surrounding whitespace and separators", () => {
    assert.equal(identifyRole({ role: " citizen " }).ok, true);
    assert.equal(identifyRole({ role: "ADMIN" }).ok, true);

    const spaced = identifyRole({ role: "Dispatcher" });
    assert.equal(spaced.ok && spaced.role, "DISPATCHER");
  });

  it("maps the documented Administrator spelling to ADMIN", () => {
    const result = identifyRole({ role: "Administrator" });

    assert.deepEqual(result, {
      ok: true,
      role: "ADMIN",
      dashboardPath: "/admin/dashboard",
    });
  });

  it("fails closed when no role is present", () => {
    assert.deepEqual(identifyRole(null), { ok: false, reason: "MISSING_ROLE" });
    assert.deepEqual(identifyRole(undefined), { ok: false, reason: "MISSING_ROLE" });
    assert.deepEqual(identifyRole({}), { ok: false, reason: "MISSING_ROLE" });
    assert.deepEqual(identifyRole({ role: "   " }), { ok: false, reason: "MISSING_ROLE" });
    assert.deepEqual(identifyRole({ role: { name: null } }), { ok: false, reason: "MISSING_ROLE" });
  });

  it("rejects unknown roles instead of defaulting to a known role", () => {
    assert.deepEqual(identifyRole({ role: "SUPERUSER" }), {
      ok: false,
      reason: "UNKNOWN_ROLE",
    });
  });
});
