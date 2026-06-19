import { Message } from '../../../domain/entities/messages/Message';
import { MessageFactory } from '../../../domain/entities/messages/MessageFactory';
import { IpfsMessageDocument } from '../documents/IpfsMessageDocument';

export default class IpfsMessageMapper {
  public toDocument(message: Message): IpfsMessageDocument {
    return {
      ...message.toPrimitives(),
      schemaVersion: 1,
    };
  }

  public toDomain(document: IpfsMessageDocument): Message {
    return MessageFactory.fromPrimitives(document);
  }
}
