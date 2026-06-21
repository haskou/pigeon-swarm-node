import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelDraft } from '../../domain/CommunityChannelDraft';
import CommunityChannelDraftRepository from '../../domain/repositories/CommunityChannelDraftRepository';
import { CommunityChannelId } from '../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageEncryptedPayload } from '../../domain/value-objects/CommunityChannelMessageEncryptedPayload';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { LocalCommunityChannelDraftDocument } from './documents/LocalCommunityChannelDraftDocument';

// eslint-disable-next-line max-len
export default class LocalCommunityChannelDraftRepository extends CommunityChannelDraftRepository {
  private static readonly NAMESPACE = 'community_channel_drafts';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private draftId(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): string {
    return `${identityId.valueOf()}:${communityId.valueOf()}:${channelId.valueOf()}`;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalCommunityChannelDraftDocument {
    return (
      typeof document._id === 'string' &&
      typeof document.channelId === 'string' &&
      typeof document.communityId === 'string' &&
      typeof document.encryptedPayload === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.updatedAt === 'number'
    );
  }

  private toDraft(
    document: LocalCommunityChannelDraftDocument,
  ): CommunityChannelDraft {
    return new CommunityChannelDraft(
      new CommunityId(document.communityId),
      new CommunityChannelId(document.channelId),
      new CommunityChannelMessageEncryptedPayload(document.encryptedPayload),
      new Timestamp(document.updatedAt),
    );
  }

  public async save(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
    encryptedPayload: CommunityChannelMessageEncryptedPayload,
    updatedAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document: LocalCommunityChannelDraftDocument = {
      _id: this.draftId(identityId, communityId, channelId),
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      encryptedPayload: encryptedPayload.valueOf(),
      identityId: identityId.valueOf(),
      updatedAt: updatedAt.valueOf(),
    };

    await this.database.save(
      LocalCommunityChannelDraftRepository.NAMESPACE,
      document._id,
      document,
    );
  }

  public async delete(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    await this.database.delete(
      LocalCommunityChannelDraftRepository.NAMESPACE,
      this.draftId(identityId, communityId, channelId),
    );
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityChannelDraft[]> {
    const documents = await this.database.find(
      LocalCommunityChannelDraftRepository.NAMESPACE,
      (document) => document.identityId === identityId.valueOf(),
    );

    return documents
      .filter((document): document is LocalCommunityChannelDraftDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((document) => this.toDraft(document));
  }
}
