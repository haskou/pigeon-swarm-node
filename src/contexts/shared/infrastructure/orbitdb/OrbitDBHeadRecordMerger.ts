export type OrbitDBHeadRecordMerger = (
  current: Record<string, unknown>,
  candidate: Record<string, unknown>,
) => Record<string, unknown>;
