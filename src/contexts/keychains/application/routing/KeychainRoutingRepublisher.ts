export default abstract class KeychainRoutingRepublisher {
  public abstract republish(): Promise<number>;
}
