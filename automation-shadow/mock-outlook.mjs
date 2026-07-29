export const RETRY_DELAYS_MS = Object.freeze([60_000, 180_000, 300_000]);

export function classifyOutlookError(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? error ?? ""}`.toLowerCase();
  if (
    text.includes("unsupported call") ||
    text.includes("unsupported action") ||
    text.includes("invalid parameter") ||
    text.includes("permission") ||
    text.includes("unauthorized") ||
    text.includes("forbidden")
  ) {
    return "NON_RETRYABLE_FAILURE";
  }
  if (
    text.includes("timeout") ||
    text.includes("connection reset") ||
    text.includes("econnreset") ||
    text.includes("rate limit") ||
    text.includes("429") ||
    text.includes("temporarily unavailable") ||
    text.includes("503")
  ) {
    return "TRANSIENT_FAILURE";
  }
  return "NON_RETRYABLE_FAILURE";
}

export class MockOutlookConnector {
  constructor(responses) {
    this.responses = [...responses];
    this.calls = [];
  }

  async send(payload) {
    this.calls.push(structuredClone(payload));
    const response = this.responses.shift() ?? { messageId: `mock-${this.calls.length}` };
    if (response instanceof Error) throw response;
    if (response?.error) {
      const error = new Error(response.error.message ?? String(response.error));
      error.code = response.error.code;
      throw error;
    }
    return response;
  }
}

export async function sendWithMockRetry({
  connector,
  payload,
  sleep = async () => {},
  retryDelaysMs = RETRY_DELAYS_MS,
}) {
  let retryCount = 0;
  const attempts = [];
  while (true) {
    try {
      const receipt = await connector.send(payload);
      if (!receipt?.messageId && !receipt?.deliveryReceipt) {
        const error = new Error("Missing message ID or delivery receipt");
        error.code = "MISSING_RECEIPT";
        throw error;
      }
      attempts.push({ attempt: retryCount + 1, status: "EMAIL_SENT" });
      return { status: "EMAIL_SENT", receipt, retryCount, attempts };
    } catch (error) {
      const classification = classifyOutlookError(error);
      attempts.push({
        attempt: retryCount + 1,
        status: classification,
        message: error instanceof Error ? error.message : String(error),
      });
      if (classification !== "TRANSIENT_FAILURE" || retryCount >= retryDelaysMs.length) {
        return {
          status: classification,
          error: { name: error?.name ?? "Error", code: error?.code ?? null, message: error?.message ?? String(error) },
          retryCount,
          attempts,
        };
      }
      await sleep(retryDelaysMs[retryCount]);
      retryCount += 1;
    }
  }
}

export async function sendWithTestLedger({ ledger, batchId, ...options }) {
  if (await ledger.hasStage(batchId, "EMAIL_SENT")) {
    return { status: "DUPLICATE_SKIPPED", retryCount: 0, attempts: [] };
  }
  const result = await sendWithMockRetry(options);
  if (result.status === "EMAIL_SENT") {
    await ledger.recordStage(batchId, "EMAIL_SENT", {
      mockOnly: true,
      receipt: result.receipt,
      retryCount: result.retryCount,
    });
  }
  return result;
}
