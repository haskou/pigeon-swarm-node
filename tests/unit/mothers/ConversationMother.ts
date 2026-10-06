import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationType } from '@app/contexts/conversations/domain/value-objects/ConversationType';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { UUID } from '@haskou/value-objects';

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
    return new OneToOneConversation(
      ConversationId.deterministic(this.author, this.recipient, this.networkId),
      this.networkId,
      ConversationType.ONE_TO_ONE,
      [this.author, this.recipient].sort((left, right) =>
        left.valueOf() < right.valueOf() ? -1 : 1,
      ),
      undefined,
      [],
      this.author,
    );
  }
}
