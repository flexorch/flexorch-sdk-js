import { Connector, type ConnectorTestResult, type ConnectorType } from "../models/connector.js";
import type { Transport } from "../transport.js";

const VALID_TYPES = new Set<ConnectorType>([
  "s3", "gcs", "azure_blob", "google_drive",
  "pgvector_external", "pinecone", "qdrant",
]);

export class ConnectorsResource {
  constructor(private readonly _t: Transport) {}

  async create(
    name: string,
    type: ConnectorType,
    config: Record<string, string>,
  ): Promise<Connector> {
    if (!VALID_TYPES.has(type)) {
      throw new Error(`Unknown connector type "${type}". Valid: ${[...VALID_TYPES].join(", ")}`);
    }
    const data = (await this._t.post("/connectors", { name, type, config })) as Record<
      string,
      unknown
    >;
    return Connector.fromDict(data);
  }

  async list(): Promise<Connector[]> {
    const data = (await this._t.get("/connectors")) as Record<string, unknown>;
    const items = (data["items"] as Record<string, unknown>[] | undefined) ?? [];
    return items.map(Connector.fromDict);
  }

  async get(connectorId: string): Promise<Connector> {
    const data = (await this._t.get(`/connectors/${connectorId}`)) as Record<string, unknown>;
    return Connector.fromDict(data);
  }

  async delete(connectorId: string): Promise<void> {
    await this._t.delete(`/connectors/${connectorId}`);
  }

  async test(connectorId: string): Promise<ConnectorTestResult> {
    const data = ((await this._t.post(`/connectors/${connectorId}/test`)) ?? {}) as Record<
      string,
      unknown
    >;
    return {
      success: Boolean(data["success"] ?? false),
      latencyMs: data["latency_ms"] !== undefined ? Number(data["latency_ms"]) : null,
      message: String(data["message"] ?? ""),
    };
  }
}
