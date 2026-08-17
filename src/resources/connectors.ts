import {
  Connector,
  type ConnectorTestResult,
  type ConnectorType,
  type SyncLog,
  type SyncSchedule,
  syncLogFromDict,
  syncScheduleFromDict,
} from "../models/connector.js";
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

  /** Define a scheduled sync for a connector (Pro+ required). */
  async createSchedule(
    connectorId: string,
    cronExpression: string,
    prefixFilter: string | null = null,
  ): Promise<SyncSchedule> {
    const data = (await this._t.post(`/connectors/${connectorId}/schedules`, {
      cron_expression: cronExpression,
      prefix_filter: prefixFilter,
    })) as Record<string, unknown>;
    return syncScheduleFromDict(data);
  }

  /** Active schedules for a connector. */
  async listSchedules(connectorId: string): Promise<SyncSchedule[]> {
    const data = (await this._t.get(`/connectors/${connectorId}/schedules`)) as Record<string, unknown>[] | null;
    return (data ?? []).map(syncScheduleFromDict);
  }

  /** Delete a scheduled sync. */
  async deleteSchedule(connectorId: string, scheduleId: string): Promise<void> {
    await this._t.delete(`/connectors/${connectorId}/schedules/${scheduleId}`);
  }

  /** Run a schedule immediately instead of waiting for its cron time. */
  async triggerSchedule(connectorId: string, scheduleId: string): Promise<SyncLog> {
    const data = (await this._t.post(
      `/connectors/${connectorId}/schedules/${scheduleId}/trigger`,
    )) as Record<string, unknown>;
    return syncLogFromDict(data);
  }

  /** Recent sync run logs for a schedule. */
  async scheduleLogs(connectorId: string, scheduleId: string): Promise<SyncLog[]> {
    const data = (await this._t.get(
      `/connectors/${connectorId}/schedules/${scheduleId}/logs`,
    )) as Record<string, unknown>[] | null;
    return (data ?? []).map(syncLogFromDict);
  }
}
