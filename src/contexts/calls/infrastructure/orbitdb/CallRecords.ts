/** The admitted signed records that describe one call. */
export interface CallRecords {
  end?: Record<string, unknown>;
  participants: Map<string, Record<string, unknown>>;
  start?: Record<string, unknown>;
}
