import { describe, expect, it } from "vitest";
import { normalizeTelegramText } from "@/lib/telegram-text";

describe("normalizeTelegramText", () => {
  it("removes common Markdown artifacts", () => {
    expect(
      normalizeTelegramText(
        "### Title\n\n**Question**\nUse `substitution`.\n\n***\n\n*Conclusion:* done.",
      ),
    ).toBe("Title\n\nQuestion\nUse substitution.\n\nConclusion: done.");
  });

  it("converts common LaTeX math into readable plain text", () => {
    expect(
      normalizeTelegramText(
        String.raw`Show that $\log_2 3 = \frac{p}{q}$ with $p \in \mathbb{Z}^+$ and q \in \mathbb{Q}.`,
      ),
    ).toBe("Show that log_2 3 = (p)/(q) with p in Z+ and q in Q.");
  });
});
