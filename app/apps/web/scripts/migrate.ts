/**
 * Minimal forward-only migration runner.
 *   pnpm db:migrate          apply pending db/migrations/*.sql in name order
 *   pnpm db:migrate --reset  drop and recreate the public schema first (dev only)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const url = process.env.DATABASE_URL ?? "postgres://navopulse:navopulse@localhost:5432/navopulse";
const dir = join(import.meta.dirname, "..", "db", "migrations");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (process.argv.includes("--reset")) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      console.log("schema reset");
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
