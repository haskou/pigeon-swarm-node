export type OrbitDBReplicatedHeadCacheEntry = {
  key: string;
  value: Record<string, unknown>;
};

export default abstract class OrbitDBReplicatedHeadCache {
  public abstract findByNetworkId(
    networkId: string,
  ): Promise<OrbitDBReplicatedHeadCacheEntry[]>;

  public abstract findReconciledHeadSignature(
    networkId: string,
  ): Promise<string | undefined>;

  public abstract isWarm(networkId: string): Promise<boolean>;

  public abstract markWarm(
    networkId: string,
    reconciledHeadSignature?: string,
  ): Promise<void>;

  public abstract save(
    networkId: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<void>;
}
