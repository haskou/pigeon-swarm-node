export class PushNotificationDeliveryResult {
  public readonly delivered!: boolean;
  public readonly endpoint!: string;
  public readonly endpointHost!: string;
  public readonly error?: string;
  public readonly shouldDeleteSubscription!: boolean;
  public readonly statusCode?: number;
}
