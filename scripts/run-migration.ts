import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function runMigrate() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is missing");
    process.exit(1);
  }

  const sql = neon(dbUrl);
  const db = drizzle(sql);

  console.log("Applying migrations from ./drizzle folder to Neon database...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migration completed successfully!");
}

runMigrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
