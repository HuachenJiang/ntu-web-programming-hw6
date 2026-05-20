import { AppError } from "@/errors/app-error";
import {
  dashboardRepository,
  type DashboardLatestUser,
  type DashboardMessage,
  type DashboardMessageFilters,
  type DashboardRepository,
} from "@/repositories/dashboard-repository";

export const DASHBOARD_DEFAULT_LIMIT = 50;
export const DASHBOARD_MAX_LIMIT = 100;

export type DashboardFilters = {
  userId: string;
  from: string;
  to: string;
  q: string;
  limit: number;
};

export type DashboardStats = {
  totalMessages: number;
  totalUsers: number;
  qwenErrorCount: number;
  latestMessageAt: string | null;
  latestUser: DashboardLatestUser | null;
};

export type DashboardData = {
  stats: DashboardStats;
  messages: DashboardMessage[];
  filters: DashboardFilters;
};

export type DashboardClientLatestUser = Omit<
  DashboardLatestUser,
  "lastSeenAt"
> & {
  lastSeenAt: string;
};

export type DashboardClientMessage = Omit<DashboardMessage, "createdAt"> & {
  createdAt: string;
};

export type DashboardClientData = Omit<DashboardData, "messages" | "stats"> & {
  stats: Omit<DashboardStats, "latestUser"> & {
    latestUser: DashboardClientLatestUser | null;
  };
  messages: DashboardClientMessage[];
};

export class DashboardQueryError extends AppError {
  constructor(message: string) {
    super(message, "ADMIN_DASHBOARD_INVALID_QUERY");
    this.name = "DashboardQueryError";
  }
}

type DashboardServiceDependencies = {
  repository?: DashboardRepository;
};

function getFirstParam(params: URLSearchParams, key: string): string {
  return params.get(key)?.trim() ?? "";
}

function parseUserId(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new DashboardQueryError("userId must be a number");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new DashboardQueryError("userId must be a safe integer");
  }

  return parsed;
}

function parseLimit(value: string): number {
  if (!value) {
    return DASHBOARD_DEFAULT_LIMIT;
  }

  if (!/^\d+$/.test(value)) {
    throw new DashboardQueryError("limit must be a number from 1 to 100");
  }

  const parsed = Number(value);

  if (parsed < 1 || parsed > DASHBOARD_MAX_LIMIT) {
    throw new DashboardQueryError("limit must be a number from 1 to 100");
  }

  return parsed;
}

function parseDateBoundary(
  value: string,
  boundary: "start" | "end",
): Date | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new DashboardQueryError("dates must use YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date =
    boundary === "start"
      ? new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
      : new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new DashboardQueryError("dates must be valid calendar dates");
  }

  return date;
}

export function parseDashboardSearchParams(
  params: URLSearchParams,
): DashboardMessageFilters & {
  filters: DashboardFilters;
} {
  const userId = getFirstParam(params, "userId");
  const from = getFirstParam(params, "from");
  const to = getFirstParam(params, "to");
  const q = getFirstParam(params, "q");
  const limit = parseLimit(getFirstParam(params, "limit"));
  const telegramUserId = parseUserId(userId);
  const fromDate = parseDateBoundary(from, "start");
  const toDate = parseDateBoundary(to, "end");

  if (fromDate && toDate && fromDate > toDate) {
    throw new DashboardQueryError(
      "from date must be before or equal to to date",
    );
  }

  return {
    ...(telegramUserId !== undefined ? { telegramUserId } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
    ...(q ? { textQuery: q } : {}),
    limit,
    filters: {
      userId,
      from,
      to,
      q,
      limit,
    },
  };
}

export async function getDashboardData(
  params: URLSearchParams,
  dependencies: DashboardServiceDependencies = {},
): Promise<DashboardData> {
  const repository = dependencies.repository ?? dashboardRepository;
  const { filters, ...messageFilters } = parseDashboardSearchParams(params);
  const [
    messages,
    totalMessages,
    totalUsers,
    qwenErrorCount,
    latestMessage,
    latestUser,
  ] = await Promise.all([
    repository.findMessages(messageFilters),
    repository.countMessages(),
    repository.countUsers(),
    repository.countQwenErrors(),
    repository.findLatestMessage(),
    repository.findLatestUser(),
  ]);

  return {
    stats: {
      totalMessages,
      totalUsers,
      qwenErrorCount,
      latestMessageAt: latestMessage?.createdAt.toISOString() ?? null,
      latestUser,
    },
    messages,
    filters,
  };
}

export function serializeDashboardData(
  data: DashboardData,
): DashboardClientData {
  return {
    stats: {
      ...data.stats,
      latestUser: data.stats.latestUser
        ? {
            ...data.stats.latestUser,
            lastSeenAt: data.stats.latestUser.lastSeenAt.toISOString(),
          }
        : null,
    },
    messages: data.messages.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
    filters: data.filters,
  };
}
