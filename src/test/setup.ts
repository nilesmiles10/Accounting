import fs from "fs";
import os from "os";
import path from "path";
import { afterAll } from "vitest";

// Elke testfile krijgt een eigen, lege data-map. getDb() leest DATA_DIR
// bij module-load, dus dit moet vóór de eerste import van @/lib/db.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-acc-test-"));
process.env.DATA_DIR = dir;
process.env.MIGRATIONS_DIR = path.resolve(__dirname, "../lib/migrations");
process.env.LOG_LEVEL = "silent";

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
