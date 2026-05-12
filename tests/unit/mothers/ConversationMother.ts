import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair, UUID } from '@haskou/value-objects';

export class ConversationMother {
  public author: IdentityId;
  public networkId: NetworkId;
  public recipient: IdentityId;

  public static async create(): Promise<ConversationMother> {
    return new ConversationMother(
      await ConversationMother.generateIdentityId(),
      await ConversationMother.generateIdentityId(),
    );
  }

  public static async generateIdentityId(): Promise<IdentityId> {
    const keyPair = await KeyPair.generate();

    return new IdentityId(keyPair.toPrimitives().publicKey);
  }

  constructor(
    author: IdentityId,
    recipient: IdentityId,
    networkId: NetworkId = new NetworkId(UUID.generate().toString()),
  ) {
    this.author = author;
    this.networkId = networkId;
    this.recipient = recipient;
  }

  public withAuthor(author: IdentityId): this {
    this.author = author;

    return this;
  }

  public withRecipient(recipient: IdentityId): this {
    this.recipient = recipient;

    return this;
  }

  public withNetworkId(networkId: NetworkId): this {
    this.networkId = networkId;

    return this;
  }

  public build(): OneToOneConversation {
    return OneToOneConversation.create(
      this.author,
      this.recipient,
      this.networkId,
    );
  }
}
