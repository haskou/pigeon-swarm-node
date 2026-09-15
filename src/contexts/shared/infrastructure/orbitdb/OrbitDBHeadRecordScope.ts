export type OrbitDBHeadRecordScope = (
  networkId: string,
  value: Record<string, unknown>,
) => Record<string, unknown> | undefined;
