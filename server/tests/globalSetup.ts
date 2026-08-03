import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DB = path.resolve(__dirname, "../prisma/test.db");

export async function setup() {
  process.env.DATABASE_URL = "file:./test.db";
  process.env.JWT_SECRET = "test-secret";
  for (const suffix of ["", "-journal"]) {
    if (fs.existsSync(TEST_DB + suffix)) fs.rmSync(TEST_DB + suffix);
  }
  execSync("npx prisma db push --skip-generate --force-reset", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}

export async function teardown() {
  for (const suffix of ["", "-journal"]) {
    if (fs.existsSync(TEST_DB + suffix)) fs.rmSync(TEST_DB + suffix);
  }
}
