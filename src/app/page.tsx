import { APP_NAME } from "@/lib/app-metadata";

const readinessItems = [
  "Next.js App Router",
  "TypeScript strict mode",
  "ESLint and Prettier",
  "Vitest smoke tests",
] as const;

export default function Home() {
  return (
    <main className="page-shell">
      <section className="intro-panel" aria-labelledby="page-title">
        <p className="eyebrow">Phase 1 foundation</p>
        <h1 id="page-title">{APP_NAME}</h1>
        <p className="summary">
          A maintainable base for the Telegram bot, AI service layer,
          persistence, and admin dashboard planned in later phases.
        </p>
        <ul className="readiness-list" aria-label="Configured foundation">
          {readinessItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
