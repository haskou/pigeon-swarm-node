export class NodeHeartbeatAttributes {
  [key: string]: unknown;

  public readonly networks?: Array<{ id: string; name: string; type: string }>;
  public readonly owner?: string;
}
