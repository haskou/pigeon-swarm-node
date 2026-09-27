export type OrbitDBHeadRepairPublisher = (
  networkId: string,
  key: string,
  value: Record<string, unknown>,
) => void;
