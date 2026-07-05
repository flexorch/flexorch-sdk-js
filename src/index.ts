export { FlexOrchClient } from "./client.js";
export type { FlexOrchClientOptions } from "./client.js";

export { Job } from "./models/job.js";
export { Dataset } from "./models/dataset.js";
export type { ExportFormat } from "./models/dataset.js";
export { Connector } from "./models/connector.js";
export type { ConnectorTestResult, ConnectorType, S3ConnectorConfig } from "./models/connector.js";
export { SearchResult } from "./models/search.js";
export type { SearchFilters } from "./models/search.js";

export type { UsageSnapshot } from "./resources/usage.js";
export type { Webhook, WebhookEvent } from "./resources/webhooks.js";

export {
  FlexOrchError,
  AuthError,
  QuotaError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  ServerError,
  JobFailedError,
  JobTimeoutError,
} from "./errors.js";

export { RAGDocument, FlexOrchRetriever, FlexOrchReader } from "./rag.js";
export type { RetrieverOptions, ReaderLoadOptions } from "./rag.js";

export const version = "0.2.0";
