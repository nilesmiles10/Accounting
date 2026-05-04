/**
 * Minimal type voor api-logger entries. Gekopieerd van willem-mc's
 * earnings/types.ts maar zonder feed/source-velden die in deze repo
 * niet relevant zijn.
 */

export interface ApiCallLogEntry {
  id: string;
  timestamp: string;
  source: string;
  url: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  dataPointsExtracted: number;
  symbol?: string;
  error?: string;
  // Anthropic kosten-velden — gevuld als URL api.anthropic.com is
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  model?: string;
}
