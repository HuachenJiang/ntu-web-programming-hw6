import { describe, expect, it, vi } from "vitest";
import { DatabaseError } from "@/errors/database-error";
import { handleAdminDashboardRequest } from "@/services/admin-dashboard-api";
import { DashboardQueryError } from "@/services/dashboard-service";
import type { DashboardData } from "@/services/dashboard-service";

const dashboardData: DashboardData = {
  stats: {
    totalMessages: 0,
    totalUsers: 0,
    qwenErrorCount: 0,
    latestMessageAt: null,
    latestUser: null,
  },
  messages: [],
  filters: {
    userId: "",
    from: "",
    to: "",
    q: "",
    limit: 50,
  },
};

function request(search = ""): Request {
  return new Request(`https://example.test/api/admin/dashboard${search}`, {
    method: "GET",
  });
}

describe("admin dashboard API", () => {
  it("returns dashboard data and passes query params to the service", async () => {
    const getDashboardData = vi.fn(async (params: URLSearchParams) => {
      void params;
      return dashboardData;
    });
    const response = await handleAdminDashboardRequest(
      request("?userId=2002"),
      {
        getDashboardData,
      },
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: dashboardData,
    });
    expect(response.status).toBe(200);
    expect(getDashboardData.mock.calls[0]?.[0]?.get("userId")).toBe("2002");
  });

  it("returns 400 for invalid dashboard query params", async () => {
    const response = await handleAdminDashboardRequest(request("?limit=0"), {
      getDashboardData: vi.fn(async () => {
        throw new DashboardQueryError("limit must be a number from 1 to 100");
      }),
    });

    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "ADMIN_DASHBOARD_INVALID_QUERY",
      message: "limit must be a number from 1 to 100",
    });
    expect(response.status).toBe(400);
  });

  it("returns 500 for database failures", async () => {
    const response = await handleAdminDashboardRequest(request(), {
      getDashboardData: vi.fn(async () => {
        throw new DatabaseError("Database operation failed");
      }),
    });

    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "DATABASE_FAILED",
      message: "Database operation failed",
    });
    expect(response.status).toBe(500);
  });
});
