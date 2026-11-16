import { execSync } from "node:child_process";

/** Fresh schema + small seed in the test database before the suite. */
export default function setup() {
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://navopulse:navopulse@localhost:5432/navopulse_test", SEED_INCIDENTS: "60" };
  execSync("npx tsx scripts/migrate.ts --reset", { env, stdio: "pipe" });
  execSync("npx tsx scripts/seed.ts", { env, stdio: "pipe" });
}
