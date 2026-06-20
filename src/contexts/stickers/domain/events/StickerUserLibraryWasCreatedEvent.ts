import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { StickerUserLibraryWasCreatedAttributes } from './StickerUserLibraryWasCreatedAttributes';

export class StickerUserLibraryWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'stickers.v1.user_library.was_created';

  constructor(
    aggregateId: string,
    attributes: StickerUserLibraryWasCreatedAttributes,
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
    return StickerUserLibraryWasCreatedEvent.EVENT_NAME;
  }
}
