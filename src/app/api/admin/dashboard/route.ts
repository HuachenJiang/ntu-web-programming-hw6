import { handleAdminDashboardRequest } from "@/services/admin-dashboard-api";

export async function GET(request: Request): Promise<Response> {
  return handleAdminDashboardRequest(request);
}
