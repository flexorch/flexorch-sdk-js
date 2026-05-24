export class SearchResult {
  readonly chunkId: string;
  readonly text: string;
  readonly score: number;
  readonly datasetId: string;
  readonly chunkIndex: number;
  readonly tokenCount: number;
  readonly metadata: Record<string, unknown>;

  constructor(data: {
    chunkId: string;
    text: string;
    score: number;
    datasetId: string;
    chunkIndex: number;
    tokenCount: number;
    metadata: Record<string, unknown>;
  }) {
    this.chunkId = data.chunkId;
    this.text = data.text;
    this.score = data.score;
    this.datasetId = data.datasetId;
    this.chunkIndex = data.chunkIndex;
    this.tokenCount = data.tokenCount;
    this.metadata = data.metadata;
  }

  static fromDict(data: Record<string, unknown>): SearchResult {
    return new SearchResult({
      chunkId: String(data["chunk_id"] ?? ""),
      text: String(data["text"] ?? ""),
      score: Number(data["score"] ?? 0),
      datasetId: String(data["dataset_id"] ?? ""),
      chunkIndex: Number(data["chunk_index"] ?? 0),
      tokenCount: Number(data["token_count"] ?? 0),
      metadata: (data["metadata"] as Record<string, unknown>) ?? {},
    });
  }

  toString(): string {
    return `SearchResult(score=${this.score.toFixed(3)}, datasetId=${this.datasetId}, chunkIndex=${this.chunkIndex})`;
  }
}

export interface SearchFilters {
  documentType?: string;
  language?: string;
  piiMasked?: boolean;
  qualityGrade?: string;
}
