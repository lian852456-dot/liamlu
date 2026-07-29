import fs from "node:fs/promises";
import path from "node:path";

function assertTestPath(rootDir) {
  const resolved = path.resolve(rootDir);
  if (!resolved.split(path.sep).includes("test-output")) {
    throw new Error("Test website publisher must stay under a test-output directory");
  }
  return resolved;
}

export function validateWebsiteSnapshot(snapshot, expectedReportEndDate) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) errors.push("JSON_ROOT_INVALID");
  if (!snapshot?.reportEndDate) errors.push("REPORT_END_DATE_MISSING");
  if (snapshot?.reportEndDate && snapshot.reportEndDate !== expectedReportEndDate) errors.push("REPORT_END_DATE_MISMATCH");
  if (!Array.isArray(snapshot?.stores)) errors.push("STORES_MISSING");
  else if (snapshot.stores.length === 0) errors.push("STORES_EMPTY");
  if (!snapshot?.summary || typeof snapshot.summary !== "object") errors.push("SUMMARY_MISSING");
  return { valid: errors.length === 0, errors };
}

export class TestLastKnownGoodPublisher {
  constructor(rootDir) {
    this.rootDir = assertTestPath(rootDir);
    this.stagingDir = path.join(this.rootDir, "staging");
    this.siteDir = path.join(this.rootDir, "site");
    this.lastKnownGoodPath = path.join(this.rootDir, "last-known-good.json");
    this.currentPath = path.join(this.siteDir, "current.json");
  }

  async seedLastKnownGood(snapshot) {
    await fs.mkdir(this.siteDir, { recursive: true });
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    await fs.writeFile(this.lastKnownGoodPath, content, "utf8");
    await fs.writeFile(this.currentPath, content, "utf8");
  }

  async publish({ batchId, snapshot, expectedReportEndDate, ledger, fault = null }) {
    await fs.mkdir(this.stagingDir, { recursive: true });
    const stagingPath = path.join(this.stagingDir, `${batchId}.json`);
    if (fault === "CORRUPT_JSON") {
      await fs.writeFile(stagingPath, '{"broken":', "utf8");
      return { status: "VALIDATION_FAILED", errors: ["JSON_PARSE_FAILED"], stagingPath };
    }
    await fs.writeFile(stagingPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const validation = validateWebsiteSnapshot(snapshot, expectedReportEndDate);
    if (!validation.valid) return { status: "VALIDATION_FAILED", ...validation, stagingPath };
    if (fault === "BUILD_FAILURE") return { status: "PARTIAL_FAILURE", error: "BUILD_FAILURE", stagingPath };
    if (await ledger.hasStage(batchId, "WEBSITE_STAGED")) {
      return { status: "DUPLICATE_SKIPPED", stagingPath };
    }
    if (fault === "COPY_INTERRUPTED") {
      const partial = `${this.currentPath}.partial`;
      await fs.writeFile(partial, '{"partial":true}', "utf8");
      return { status: "PARTIAL_FAILURE", error: "COPY_INTERRUPTED", stagingPath };
    }
    const temporary = `${this.currentPath}.tmp`;
    await fs.mkdir(this.siteDir, { recursive: true });
    await fs.copyFile(stagingPath, temporary);
    await fs.rename(temporary, this.currentPath);
    await fs.copyFile(this.currentPath, this.lastKnownGoodPath);
    await ledger.recordStage(batchId, "WEBSITE_STAGED", { stagingPath });
    return { status: "WEBSITE_STAGED", stagingPath, currentPath: this.currentPath };
  }

  async readCurrent() {
    return JSON.parse(await fs.readFile(this.currentPath, "utf8"));
  }

  async readLastKnownGood() {
    return JSON.parse(await fs.readFile(this.lastKnownGoodPath, "utf8"));
  }
}
