#!/usr/bin/env node

/**
 * Validates Supabase migration files for CI.
 *
 * Checks:
 *  - Naming convention: NNN_description.sql (three-digit sequential prefix)
 *  - Files are non-empty and valid UTF-8
 *  - Prefixes are sequential with no gaps
 *  - Warns on dangerous patterns (DROP TABLE without IF EXISTS, TRUNCATE,
 *    DELETE FROM without WHERE)
 *
 * Exit code 1 on any error; warnings alone do not fail the build.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  "../supabase/migrations",
);

const NAMING_RE = /^(\d{3})_[a-z][a-z0-9_]*\.sql$/;

const DANGEROUS_PATTERNS = [
  {
    label: "DROP TABLE without IF EXISTS",
    pattern: /\bDROP\s+TABLE\b(?![\s\S]{0,20}\bIF\s+EXISTS\b)/gi,
  },
  {
    label: "DROP INDEX without IF EXISTS",
    pattern: /\bDROP\s+INDEX\b(?![\s\S]{0,20}\bIF\s+EXISTS\b)/gi,
  },
  {
    label: "TRUNCATE statement",
    pattern: /\bTRUNCATE\b/gi,
  },
  {
    label: "DELETE FROM without WHERE",
    pattern: /\bDELETE\s+FROM\s+\S+\s*;/gi,
  },
];

async function main() {
  let errors = 0;
  let warnings = 0;

  let entries;
  try {
    entries = await readdir(MIGRATIONS_DIR);
  } catch {
    console.error(`ERROR: migrations directory not found at ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

  if (sqlFiles.length === 0) {
    console.log("No migration files found — nothing to validate.");
    process.exit(0);
  }

  console.log(`Found ${sqlFiles.length} migration file(s) in ${MIGRATIONS_DIR}\n`);

  // ---- Naming convention & sequencing ----
  const seenPrefixes = [];

  for (const file of sqlFiles) {
    const match = file.match(NAMING_RE);
    if (!match) {
      console.error(`ERROR  [naming]  ${file} — expected pattern NNN_description.sql (lowercase, underscore-separated)`);
      errors++;
      continue;
    }
    seenPrefixes.push(Number(match[1]));
  }

  // Check sequential ordering (starting from whatever the first number is)
  for (let i = 1; i < seenPrefixes.length; i++) {
    if (seenPrefixes[i] !== seenPrefixes[i - 1] + 1) {
      console.error(
        `ERROR  [sequence]  gap or out-of-order prefix: ${String(seenPrefixes[i - 1]).padStart(3, "0")} -> ${String(seenPrefixes[i]).padStart(3, "0")}`,
      );
      errors++;
    }
  }

  // ---- Per-file content checks ----
  for (const file of sqlFiles) {
    const filePath = join(MIGRATIONS_DIR, file);
    let content;

    try {
      content = await readFile(filePath, "utf-8");
    } catch (err) {
      console.error(`ERROR  [read]  ${file} — could not read as UTF-8: ${err.message}`);
      errors++;
      continue;
    }

    // Non-empty check
    if (content.trim().length === 0) {
      console.error(`ERROR  [empty]  ${file} — migration file is empty`);
      errors++;
      continue;
    }

    // Dangerous patterns
    for (const { label, pattern } of DANGEROUS_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        console.warn(`WARN   [dangerous]  ${file} — contains ${label}`);
        warnings++;
      }
    }

    console.log(`  OK   ${file}`);
  }

  // ---- Summary ----
  console.log("\n--- Migration Validation Summary ---");
  console.log(`  Files scanned : ${sqlFiles.length}`);
  console.log(`  Errors        : ${errors}`);
  console.log(`  Warnings      : ${warnings}`);

  if (errors > 0) {
    console.error("\nValidation FAILED — fix the errors above.");
    process.exit(1);
  }

  if (warnings > 0) {
    console.log("\nValidation passed with warnings.");
  } else {
    console.log("\nAll migrations OK.");
  }
}

main();
