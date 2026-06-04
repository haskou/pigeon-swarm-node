export type WebSocketDomainEvent = {
  aggregate_id: string;
  attributes: Record<string, unknown>;
  causation_id?: string;
  correlation_id?: string;
  event_id: string;
  occurred_on: number;
  type: string;
};
