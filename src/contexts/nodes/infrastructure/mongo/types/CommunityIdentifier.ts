import { MongoCommunityDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityDocument';

export type CommunityIdentifier = Pick<MongoCommunityDocument, '_id'>;
