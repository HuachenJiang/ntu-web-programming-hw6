export function buildDashboardPollingUrl(queryString: string): string {
  const normalizedQueryString = queryString.trim().replace(/^\?/, "");

  return normalizedQueryString
    ? `/api/admin/dashboard?${normalizedQueryString}`
    : "/api/admin/dashboard";
}
