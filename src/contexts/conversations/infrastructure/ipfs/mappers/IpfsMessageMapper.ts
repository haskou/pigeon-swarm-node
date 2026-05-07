import { Message } from '../../../domain/Message';
import { MessageFactory } from '../../../domain/MessageFactory';
import { IpfsMessageDocument } from '../documents/IpfsMessageDocument';

export default class IpfsMessageMapper {
  public toDocument(event: Message): IpfsMessageDocument {
    return {
      ...event.toPrimitives(),
      schemaVersion: 1,
    };
  }

  public toDomain(document: IpfsMessageDocument): Message {
    return MessageFactory.fromPrimitives(document);
  }
}
