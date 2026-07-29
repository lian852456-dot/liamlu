import fs from "node:fs/promises";
import path from "node:path";

function assertTestPath(rootDir) {
  const resolved = path.resolve(rootDir);
  if (!resolved.split(path.sep).includes("test-output")) {
    throw new Error("Test ledger must stay under a test-output directory");
  }
  return resolved;
}

export class TestIdempotencyLedger {
  constructor(rootDir) {
    this.rootDir = assertTestPath(rootDir);
  }

  filePath(batchId) {
    if (!/^[A-Za-z0-9._-]+$/.test(batchId)) throw new Error("Unsafe batchId");
    return path.join(this.rootDir, `${batchId}.json`);
  }

  async read(batchId) {
    try {
      return JSON.parse(await fs.readFile(this.filePath(batchId), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async initialize(identity, metadata = {}) {
    await fs.mkdir(this.rootDir, { recursive: true });
    const existing = await this.read(identity.batchId);
    if (existing) return { created: false, record: existing };
    const now = new Date().toISOString();
    const record = {
      batchId: identity.batchId,
      identity: identity.components,
      createdAt: now,
      updatedAt: now,
      completedStages: [],
      stageDetails: {},
      metadata,
    };
    await this.#write(record);
    return { created: true, record };
  }

  async recordStage(batchId, stage, details = {}) {
    const record = await this.read(batchId);
    if (!record) throw new Error(`Unknown test batch: ${batchId}`);
    if (!record.completedStages.includes(stage)) record.completedStages.push(stage);
    record.stageDetails[stage] = { at: new Date().toISOString(), ...details };
    record.updatedAt = new Date().toISOString();
    await this.#write(record);
    return record;
  }

  async hasStage(batchId, stage) {
    const record = await this.read(batchId);
    return Boolean(record?.completedStages.includes(stage));
  }

  async #write(record) {
    const target = this.filePath(record.batchId);
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  }
}
