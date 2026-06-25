import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { StickerPackWasCreatedAttributes } from './StickerPackWasCreatedAttributes';

export class StickerPackWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'stickers.v1.pack.was_created';

  constructor(
    aggregateId: string,
    attributes: StickerPackWasCreatedAttributes,
    eventId?: string,
    occurredOn?: Date,
    correlationId?: string,
    causationId?: string,
  ) {
    super(
      aggregateId,
      attributes,
      eventId,
      occurredOn,
      correlationId,
      causationId,
    );
  }

  public eventName(): string {
    return StickerPackWasCreatedEvent.EVENT_NAME;
  }
}
