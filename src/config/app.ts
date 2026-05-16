import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-metadata";

export {
  appEnvKeys,
  ConfigError,
  loadAppConfig,
  validateAppConfig,
} from "@/config/env";
export type {
  AppEnvironmentConfig,
  AppEnvKey,
  ConfigIssue,
} from "@/config/env";

export const appConfig = {
  name: APP_NAME,
  description: APP_DESCRIPTION,
} as const;
