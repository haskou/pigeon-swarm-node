export interface MongoProcessedDomainEventDocument {
  _id: string;
  aggregateId: string;
  eventId: string;
  eventName: string;
  processedAt: number;
  queueName: string;
}
