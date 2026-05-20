import { describe, expect, it } from "vitest";
import { buildDashboardPollingUrl } from "@/app/admin/dashboard-polling";

describe("dashboard polling", () => {
  it("preserves the active dashboard filters in the polling URL", () => {
    expect(
      buildDashboardPollingUrl(
        "userId=2002&from=2026-05-19&to=2026-05-20&q=derivative&limit=20",
      ),
    ).toBe(
      "/api/admin/dashboard?userId=2002&from=2026-05-19&to=2026-05-20&q=derivative&limit=20",
    );
  });

  it("uses the unfiltered dashboard endpoint when there is no query", () => {
    expect(buildDashboardPollingUrl("")).toBe("/api/admin/dashboard");
    expect(buildDashboardPollingUrl("?")).toBe("/api/admin/dashboard");
  });
});
