export type OrbitDBHeadReadmission = {
  networkId: string;
  onReadmitted(admitted: Record<string, unknown>): void | Promise<void>;
};
