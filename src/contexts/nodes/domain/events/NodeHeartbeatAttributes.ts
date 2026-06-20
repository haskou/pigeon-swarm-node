export class NodeHeartbeatAttributes {
  [key: string]: unknown;

  public readonly networks?: Array<{ id: string; name: string }>;
  public readonly owner?: string;
}
