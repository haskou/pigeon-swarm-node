export type OrbitDBHeadRecordMerger = (
  current: Record<string, unknown> | undefined,
  candidate: Record<string, unknown>,
  key: string,
) => Record<string, unknown> | undefined;
