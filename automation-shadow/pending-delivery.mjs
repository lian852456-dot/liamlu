import fs from "node:fs/promises";
import path from "node:path";

const SECRET_KEY = /(token|password|secret|api[_-]?key|authorization|credential|pat)/i;

function assertTestPath(rootDir) {
  const resolved = path.resolve(rootDir);
  if (!resolved.split(path.sep).includes("test-output")) {
    throw new Error("Pending delivery must stay under a test-output directory");
  }
  return resolved;
}

export function redactSecrets(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactSecrets(child, childKey)]));
  }
  return value;
}

async function copyTestFiles(files, destination) {
  await fs.mkdir(destination, { recursive: true });
  const copied = [];
  for (const source of files) {
    const safeName = path.basename(source);
    const target = path.join(destination, safeName);
    await fs.copyFile(source, target);
    copied.push({ name: safeName, path: target });
  }
  return copied;
}

export async function createPendingDelivery({
  rootDir,
  dateToken,
  batchId,
  emailPayload,
  error,
  attachments = [],
  images = [],
  completedStages = [],
  remainingStages = [],
  retryCount = 0,
}) {
  if (!/^\d{8}$/.test(dateToken)) throw new Error("dateToken must be YYYYMMDD");
  if (!/^[A-Za-z0-9._-]+$/.test(batchId)) throw new Error("Unsafe batchId");
  const base = path.join(assertTestPath(rootDir), dateToken, batchId);
  await fs.mkdir(base, { recursive: true });
  const [copiedAttachments, copiedImages] = await Promise.all([
    copyTestFiles(attachments, path.join(base, "attachments")),
    copyTestFiles(images, path.join(base, "images")),
  ]);
  const createdAt = new Date().toISOString();
  const classification = error.classification ?? "NON_RETRYABLE_FAILURE";
  const manifest = {
    batchId,
    createdAt,
    errorClassification: classification,
    retryCount,
    completedStages,
    remainingStages,
    attachments: copiedAttachments,
    images: copiedImages,
  };
  await Promise.all([
    fs.writeFile(path.join(base, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(base, "email-payload.json"), `${JSON.stringify(redactSecrets(emailPayload), null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(base, "error.json"), `${JSON.stringify(redactSecrets({ ...error, createdAt }), null, 2)}\n`, "utf8"),
  ]);
  return { base, manifest };
}
