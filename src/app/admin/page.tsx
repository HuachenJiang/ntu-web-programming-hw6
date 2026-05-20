import Link from "next/link";
import { AdminDashboardClient } from "@/app/admin/admin-dashboard-client";
import styles from "@/app/admin/page.module.css";
import { loadAppConfig } from "@/config/app";
import { DatabaseError } from "@/errors/database-error";
import {
  DashboardQueryError,
  getDashboardData,
  serializeDashboardData,
  type DashboardClientData,
} from "@/services/dashboard-service";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function searchParamsToUrlSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return params;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DashboardQueryError || error instanceof DatabaseError) {
    return error.message;
  }

  return "Unable to load dashboard data.";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const params = searchParamsToUrlSearchParams(resolvedSearchParams);
  const queryString = params.toString();
  const pollingIntervalMs = loadAppConfig().admin.pollingIntervalMs;
  let data: DashboardClientData | null = null;
  let errorMessage: string | null = null;

  try {
    data = serializeDashboardData(await getDashboardData(params));
  } catch (error) {
    errorMessage = getErrorMessage(error);
  }

  return (
    <main className={styles.adminShell}>
      <div className={styles.adminFrame}>
        <header className={styles.topBar}>
          <div>
            <p className={styles.eyebrow}>IB AAHL Bot</p>
            <h1 className={styles.title}>Admin Dashboard</h1>
          </div>
          <Link className={styles.homeLink} href="/">
            Home
          </Link>
        </header>
        <AdminDashboardClient
          initialData={data}
          initialErrorMessage={errorMessage}
          pollingIntervalMs={pollingIntervalMs}
          queryString={queryString}
        />
      </div>
    </main>
  );
}
