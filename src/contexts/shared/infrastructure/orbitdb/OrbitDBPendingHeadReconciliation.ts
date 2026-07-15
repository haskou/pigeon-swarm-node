export type OrbitDBPendingHeadReconciliation = {
  headSignature: string | undefined;
  reconcile(headSignature: string | undefined): Promise<void>;
  scope: string;
};
