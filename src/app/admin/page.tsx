import Link from "next/link";
import { DatabaseError } from "@/errors/database-error";
import {
  DashboardQueryError,
  getDashboardData,
  type DashboardData,
} from "@/services/dashboard-service";
import styles from "@/app/admin/page.module.css";

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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: Date | string | null): string {
  if (!value) {
    return "No data";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getLatestUserLabel(
  latestUser: DashboardData["stats"]["latestUser"],
): string {
  if (!latestUser) {
    return "No data";
  }

  return latestUser.username
    ? `@${latestUser.username}`
    : (latestUser.firstName ?? String(latestUser.telegramUserId));
}

function ErrorPanel({ error }: { error: unknown }) {
  const message =
    error instanceof DashboardQueryError || error instanceof DatabaseError
      ? error.message
      : "Unable to load dashboard data.";

  return (
    <section className={styles.errorState} aria-labelledby="admin-error-title">
      <h2 id="admin-error-title">Dashboard unavailable</h2>
      <p>{message}</p>
    </section>
  );
}

function StatsGrid({ data }: { data: DashboardData }) {
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

function FilterForm({ data }: { data: DashboardData }) {
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

function MessageTable({ data }: { data: DashboardData }) {
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

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const params = searchParamsToUrlSearchParams(resolvedSearchParams);
  let data: DashboardData | null = null;
  let error: unknown = null;

  try {
    data = await getDashboardData(params);
  } catch (caughtError) {
    error = caughtError;
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
        {data ? (
          <>
            <StatsGrid data={data} />
            <FilterForm data={data} />
            <MessageTable data={data} />
          </>
        ) : (
          <ErrorPanel error={error} />
        )}
      </div>
    </main>
  );
}
