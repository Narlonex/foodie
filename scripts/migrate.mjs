#!/usr/bin/env node
/**
 * Applies SQL migrations from db/migrations in filename order.
 * Each migration runs once inside a transaction and is recorded in schema_migrations.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run db:migrate
 * or put DATABASE_URL in .env.local.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const migrationsDir = path.join(process.cwd(), "db", "migrations");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Add your Neon connection string to .env.local or export it before running migrations.",
  );
  process.exit(1);
}

const useSsl =
  !/localhost|127\.0\.0\.1|::1/.test(connectionString) &&
  !/[?&]sslmode=disable/.test(connectionString);

const client = new pg.Client({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await client.query("SELECT filename FROM schema_migrations")).rows.map(
      (row) => row.filename,
    ),
  );

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      count += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${error.message}`, {
        cause: error,
      });
    }
  }

  console.log(
    count === 0
      ? "Database is up to date."
      : `Applied ${count} migration${count === 1 ? "" : "s"}.`,
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
