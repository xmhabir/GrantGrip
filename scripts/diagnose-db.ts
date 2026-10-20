import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { neon } from "@neondatabase/serverless";

async function diagnose() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("DIAGNOSIS: DATABASE_URL is undefined or empty");
    return;
  }

  // Parse URL safely without leaking passwords
  try {
    const parsed = new URL(dbUrl);
    console.log("DIAGNOSIS: DATABASE_URL protocol:", parsed.protocol);
    console.log("DIAGNOSIS: DATABASE_URL host:", parsed.host);
    console.log("DIAGNOSIS: DATABASE_URL pathname (database):", parsed.pathname);
    console.log("DIAGNOSIS: DATABASE_URL username present:", !!parsed.username);
    console.log("DIAGNOSIS: DATABASE_URL password present:", !!parsed.password);
  } catch (e: any) {
    console.log("DIAGNOSIS: Failed to parse DATABASE_URL as URL:", e.message);
  }

  try {
    const sql = neon(dbUrl);
    console.log("DIAGNOSIS: Attempting connection and query to information_schema...");
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    console.log("DIAGNOSIS: Connected successfully. Existing tables in public schema:", tables.map((t: any) => t.table_name));

    // Check specifically for organizations table
    const hasOrgs = tables.some((t: any) => t.table_name === "organizations");
    if (hasOrgs) {
      const columns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'organizations'
        ORDER BY ordinal_position;
      `;
      console.log("DIAGNOSIS: organizations table columns:", columns.map((c: any) => `${c.column_name} (${c.data_type})`));
      
      const count = await sql`SELECT count(*)::int as count FROM organizations;`;
      console.log("DIAGNOSIS: organizations row count:", count[0]?.count);
    } else {
      console.log("DIAGNOSIS: organizations table DOES NOT EXIST in database!");
    }
  } catch (err: any) {
    console.error("DIAGNOSIS: Query execution error:", {
      name: err.name,
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      where: err.where,
      schema: err.schema,
      table: err.table,
      severity: err.severity,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    });
  }
}

diagnose();
