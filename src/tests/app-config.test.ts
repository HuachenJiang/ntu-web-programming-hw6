import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";

describe("appConfig", () => {
  it("exposes the project identity", () => {
    expect(appConfig.name).toBe("IB AAHL AI Study Assistant Bot");
    expect(appConfig.description).toContain("Telegram");
  });
});
