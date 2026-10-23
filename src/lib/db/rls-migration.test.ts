import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function publicSchemaTables() {
  const schemaDir = join(process.cwd(), "src/lib/db/schema");
  const tableNames = new Set<string>();

  for (const fileName of readdirSync(schemaDir)) {
    if (!fileName.endsWith(".ts")) {
      continue;
    }

    const source = readFileSync(join(schemaDir, fileName), "utf8");
    const tableMatches = source.matchAll(/pgTable\(\s*["']([^"']+)["']/g);

    for (const match of tableMatches) {
      tableNames.add(match[1]);
    }
  }

  return [...tableNames].sort();
}

function migrationRlsTables() {
  const migration = readFileSync(join(process.cwd(), "drizzle/0002_enforce_workspace_rls.sql"), "utf8");
  const allTablesBlock = migration.match(/all_rls_tables text\[\] := ARRAY\[(?<body>[\s\S]*?)\];/);
  assert.ok(allTablesBlock?.groups?.body, "RLS migration must declare all_rls_tables.");

  return [...allTablesBlock.groups.body.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}

test("RLS migration enables every public application table", () => {
  assert.deepEqual(migrationRlsTables(), publicSchemaTables());
});

test("RLS migration keeps anon blocked and forces row level security", () => {
  const migration = readFileSync(join(process.cwd(), "drizzle/0002_enforce_workspace_rls.sql"), "utf8");

  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /\bGRANT\b(?! authenticated TO)[\s\S]*?\bTO\s+anon\b/i);
});
