"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildDashboardPollingUrl } from "@/app/admin/dashboard-polling";
import styles from "@/app/admin/page.module.css";
import type { DashboardClientData } from "@/services/dashboard-service";

type AdminDashboardApiResponse =
  | {
      ok: true;
      data: DashboardClientData;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
    };

type AdminDashboardClientProps = {
  initialData: DashboardClientData | null;
  initialErrorMessage: string | null;
  pollingIntervalMs: number;
  queryString: string;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No data";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getLatestUserLabel(
  latestUser: DashboardClientData["stats"]["latestUser"],
): string {
  if (!latestUser) {
    return "No data";
  }

  return latestUser.username
    ? `@${latestUser.username}`
    : (latestUser.firstName ?? String(latestUser.telegramUserId));
}

function getErrorMessage(response: AdminDashboardApiResponse): string {
  return response.ok ? "" : response.message;
}

function ErrorPanel({ message }: { message: string | null }) {
  return (
    <section className={styles.errorState} aria-labelledby="admin-error-title">
      <h2 id="admin-error-title">Dashboard unavailable</h2>
      <p>{message ?? "Unable to load dashboard data."}</p>
    </section>
  );
}

function StatsGrid({ data }: { data: DashboardClientData }) {
  const { stats } = data;

  return (
    <section className={styles.statsGrid} aria-label="Dashboard statistics">
      <article className={styles.statTile}>
        <p className={styles.statLabel}>Messages</p>
        <p className={styles.statValue}>{formatNumber(stats.totalMessages)}</p>
      </article>
      <article className={styles.statTile}>
        <p className={styles.statLabel}>Users</p>
        <p className={styles.statValue}>{formatNumber(stats.totalUsers)}</p>
      </article>
      <article className={styles.statTile}>
        <p className={styles.statLabel}>Qwen errors</p>
        <p className={styles.statValue}>{formatNumber(stats.qwenErrorCount)}</p>
      </article>
      <article className={styles.statTile}>
        <p className={styles.statLabel}>Latest message</p>
        <p className={styles.statMeta}>
          {formatDateTime(stats.latestMessageAt)}
        </p>
      </article>
      <article className={styles.statTile}>
        <p className={styles.statLabel}>Latest user</p>
        <p className={styles.statValue}>
          {getLatestUserLabel(stats.latestUser)}
        </p>
        {stats.latestUser ? (
          <p className={styles.statMeta}>
            {formatDateTime(stats.latestUser.lastSeenAt)}
          </p>
        ) : null}
      </article>
    </section>
  );
}

function FilterForm({ data }: { data: DashboardClientData }) {
  const { filters } = data;

  return (
    <section className={styles.filterBand} aria-label="Message filters">
      <form className={styles.filterForm} action="/admin" method="get">
        <div className={styles.field}>
          <label htmlFor="userId">User ID</label>
          <input
            id="userId"
            name="userId"
            inputMode="numeric"
            defaultValue={filters.userId}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="from">From</label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={filters.from}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className={styles.field}>
          <label htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={filters.q} />
        </div>
        <div className={styles.field}>
          <label htmlFor="limit">Limit</label>
          <input
            id="limit"
            name="limit"
            inputMode="numeric"
            defaultValue={String(filters.limit)}
          />
        </div>
        <button className={styles.button} type="submit">
          Apply
        </button>
        <Link className={styles.clearLink} href="/admin">
          Clear
        </Link>
      </form>
    </section>
  );
}

function MessageTable({ data }: { data: DashboardClientData }) {
  if (data.messages.length === 0) {
    return (
      <section className={styles.emptyState} aria-labelledby="empty-title">
        <h2 id="empty-title">No messages found</h2>
        <p>
          The current database query did not return any conversation records.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className={styles.tableHeader}>
        <h2 className={styles.sectionTitle}>Recent messages</h2>
        <p className={styles.resultCount}>
          Showing {data.messages.length} of {data.filters.limit}
        </p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.messageTable}>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Direction</th>
              <th>Kind</th>
              <th>Route</th>
              <th>Message</th>
              <th>Chat</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>
            {data.messages.map((message) => (
              <tr key={message.id}>
                <td>{formatDateTime(message.createdAt)}</td>
                <td className={styles.mono}>
                  <Link
                    className={styles.userLink}
                    href={`/admin?userId=${message.telegramUserId}`}
                  >
                    {message.telegramUserId}
                  </Link>
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      message.direction === "outbound" ? styles.outbound : ""
                    }`}
                  >
                    {message.direction}
                  </span>
                </td>
                <td>{message.kind}</td>
                <td>{message.route}</td>
                <td>
                  <p className={styles.messageText}>{message.text}</p>
                </td>
                <td className={styles.mono}>{message.chatId}</td>
                <td className={styles.mono}>{message.updateId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LiveStatus({
  errorMessage,
  lastRefreshedAt,
  pollingIntervalMs,
}: {
  errorMessage: string | null;
  lastRefreshedAt: string | null;
  pollingIntervalMs: number;
}) {
  return (
    <section className={styles.liveStatus} aria-live="polite">
      <p>
        Polling every {Math.round(pollingIntervalMs / 1000)}s
        {lastRefreshedAt ? ` · Last refreshed ${lastRefreshedAt}` : ""}
      </p>
      {errorMessage ? (
        <p className={styles.refreshError}>{errorMessage}</p>
      ) : null}
    </section>
  );
}

export function AdminDashboardClient({
  initialData,
  initialErrorMessage,
  pollingIntervalMs,
  queryString,
}: AdminDashboardClientProps) {
  const [data, setData] = useState(initialData);
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string | null>(
    null,
  );
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const pollingUrl = useMemo(
    () => buildDashboardPollingUrl(queryString),
    [queryString],
  );

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function refreshDashboardData() {
      try {
        const response = await fetch(pollingUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as AdminDashboardApiResponse;

        if (!response.ok || !body.ok) {
          throw new Error(
            getErrorMessage(body) || "Unable to refresh dashboard data.",
          );
        }

        if (!isMounted) {
          return;
        }

        setData(body.data);
        setErrorMessage(null);
        setRefreshErrorMessage(null);
        setLastRefreshedAt(formatDateTime(new Date().toISOString()));
      } catch (error) {
        if (!isMounted || controller.signal.aborted) {
          return;
        }

        setRefreshErrorMessage("Unable to refresh dashboard data.");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load dashboard data.",
        );
      }
    }

    const intervalId = window.setInterval(
      refreshDashboardData,
      pollingIntervalMs,
    );

    return () => {
      isMounted = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [pollingIntervalMs, pollingUrl]);

  return (
    <>
      <LiveStatus
        errorMessage={refreshErrorMessage}
        lastRefreshedAt={lastRefreshedAt}
        pollingIntervalMs={pollingIntervalMs}
      />
      {data ? (
        <>
          <StatsGrid data={data} />
          <FilterForm data={data} />
          <MessageTable data={data} />
        </>
      ) : (
        <ErrorPanel message={errorMessage} />
      )}
    </>
  );
}
