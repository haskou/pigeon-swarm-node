import { InvalidNodeBlockSourceApprovalError } from '@app/contexts/nodes/domain/errors/InvalidNodeBlockSourceApprovalError';
import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodeBlockListVersion } from '@app/contexts/nodes/domain/value-objects/NodeBlockListVersion';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

export class NodeBlockSourceEntriesApproverMessage {
  public readonly ownerIdentityId: IdentityId;
  public readonly version: NodeBlockListVersion;
  /** Undefined approves every pending entry of `version`. */
  public readonly entries: NodeBlockEntries | undefined;

  constructor(params: {
    all: boolean;
    blockedIdentityIds: string[];
    blockedNodePeerIds: string[];
    ownerIdentityId: string;
    version: number;
  }) {
    const named = new NodeBlockEntries(
      params.blockedIdentityIds.map((id) => new IdentityId(id)),
      params.blockedNodePeerIds.map((id) => new NodePeerId(id)),
    );

    assert(
      params.all === (named.count() === 0),
      new InvalidNodeBlockSourceApprovalError(),
    );

    this.ownerIdentityId = new IdentityId(params.ownerIdentityId);
    this.version = new NodeBlockListVersion(params.version);
    this.entries = params.all ? undefined : named;
  }
}
