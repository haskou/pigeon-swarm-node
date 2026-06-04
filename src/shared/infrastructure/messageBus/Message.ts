export interface Message {
  retries: number;
  routingKey: string;
  event: string;
  exchange: string;
  type: string;
  occurred_on: string | number;
  aggregate_id: string;
  attributes: Record<string, unknown>;
  event_id: string;
  user_id: string;
}
