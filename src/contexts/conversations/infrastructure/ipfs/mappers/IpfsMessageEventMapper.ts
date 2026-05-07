import { MessageEvent } from '../../../domain/MessageEvent';
import { MessageEventFactory } from '../../../domain/MessageEventFactory';
import { IpfsMessageEventDocument } from '../documents/IpfsMessageEventDocument';

export default class IpfsMessageEventMapper {
  public toDocument(event: MessageEvent): IpfsMessageEventDocument {
    return {
      ...event.toPrimitives(),
      schemaVersion: 1,
    };
  }

  public toDomain(document: IpfsMessageEventDocument): MessageEvent {
    return MessageEventFactory.fromPrimitives(document);
  }
}
