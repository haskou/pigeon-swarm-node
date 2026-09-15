export type OrbitDBHeadRecordMerger = (
  current: Record<string, unknown> | undefined,
  candidate: Record<string, unknown>,
) => Record<string, unknown> | undefined;
