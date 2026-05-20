import { DatabaseError } from "@/errors/database-error";
import {
  DashboardQueryError,
  getDashboardData,
  serializeDashboardData,
  type DashboardData,
} from "@/services/dashboard-service";

type AdminDashboardApiDependencies = {
  getDashboardData?: (params: URLSearchParams) => Promise<DashboardData>;
};

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown server error";
}

export async function handleAdminDashboardRequest(
  request: Request,
  dependencies: AdminDashboardApiDependencies = {},
): Promise<Response> {
  const loadDashboardData = dependencies.getDashboardData ?? getDashboardData;
  const url = new URL(request.url);

  try {
    const data = await loadDashboardData(url.searchParams);

    return jsonResponse({ ok: true, data: serializeDashboardData(data) }, 200);
  } catch (error) {
    if (error instanceof DashboardQueryError) {
      return jsonResponse(
        {
          ok: false,
          errorCode: error.code,
          message: error.message,
        },
        400,
      );
    }

    if (error instanceof DatabaseError) {
      return jsonResponse(
        {
          ok: false,
          errorCode: error.code,
          message: error.message,
        },
        500,
      );
    }

    return jsonResponse(
      {
        ok: false,
        errorCode: "UNKNOWN_SERVER_ERROR",
        message: getErrorMessage(error),
      },
      500,
    );
  }
}
