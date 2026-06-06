import { CommunityChannelMessageDeletionSignaturePayload } from './CommunityChannelMessageDeletionSignaturePayload';
import { CommunityChannelMessageEditionSignaturePayload } from './CommunityChannelMessageEditionSignaturePayload';
import { CommunityChannelMessageSignaturePayload } from './CommunityChannelMessageSignaturePayload';

export type CommunityChannelSignaturePayload =
  | CommunityChannelMessageSignaturePayload
  | CommunityChannelMessageDeletionSignaturePayload
  | CommunityChannelMessageEditionSignaturePayload;
