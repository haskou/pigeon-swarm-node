import { AuthenticatedIdentityIsNotNodeOwnerError } from '@app/apps/apis/nodes-api/errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NodeOwnerRouteSupport } from '@app/apps/apis/nodes-api/routes/NodeOwnerRouteSupport';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { NodeOwnerWriteHolderMessage } from '@app/contexts/nodes/application/hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import NodeOwnerWriteHolder from '@app/contexts/nodes/application/hold-owner-write/NodeOwnerWriteHolder';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { NodeCanOnlyBeManagedByItsOwnerError } from '@app/contexts/nodes/domain/errors/NodeCanOnlyBeManagedByItsOwnerError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Kernel } from '@haskou/ddd-kernel';
import { Request } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
import { NodeMother } from '../../../mothers/NodeMother';

class OwnerRoute extends NodeOwnerRouteSupport {
  public change<T>(
    request: Request,
    change: (identityId: IdentityId) => Promise<T>,
  ): Promise<T> {
    return this.changeNodeAsOwner(request, change);
  }

  public setUp<T>(
    request: Request,
    change: (identityId: IdentityId | undefined) => Promise<T>,
  ): Promise<T> {
    return this.setUpNodeAsOwnerWhenClaimed(request, change);
  }

  public write<T>(
    request: Request,
    write: (identityId: IdentityId) => Promise<T>,
  ): Promise<T> {
    return this.writeAsNodeOwner(request, write);
  }
}

/**
 * The route checks the owner before the write, and the write checks it again
 * as it lands; an owner handover in between refuses the write as 403010 too.
 */
describe('NodeOwnerRouteSupport', () => {
  const request = mock<Request>();
  let owner: IdentityId;
  let nodeLoader: MockProxy<NodeLoader>;
  let authenticator: MockProxy<SignedHttpRequestAuthenticator>;
  let holder: MockProxy<NodeOwnerWriteHolder>;
  let route: OwnerRoute;

  beforeEach(() => {
    owner = IdentityIdMother.canonical();
    nodeLoader = mock<NodeLoader>();
    nodeLoader.loadNode.mockResolvedValue(
      new NodeMother().withOwner(owner).build(),
    );
    authenticator = mock<SignedHttpRequestAuthenticator>();
    authenticator.authenticate.mockResolvedValue(owner);
    holder = mock<NodeOwnerWriteHolder>();
    holder.hold.mockImplementation(async (_message, write) => write());

    const services = new Map<unknown, unknown>([
      [NodeLoader, nodeLoader],
      [NodeOwnerWriteHolder, holder],
      [SignedHttpRequestAuthenticator, authenticator],
    ]);
    new Kernel({
      di: { getService: (service: unknown) => services.get(service) } as never,
    });
    route = new OwnerRoute();
  });

  describe('writeAsNodeOwner', () => {
    it('should run the write of the owner while the node is held for them', async () => {
      const write = jest.fn().mockResolvedValue('written');

      await expect(route.write(request, write)).resolves.toBe('written');
      expect(write).toHaveBeenCalledWith(owner);
      expect(holder.hold).toHaveBeenCalledWith(
        new NodeOwnerWriteHolderMessage(owner.valueOf()),
        expect.any(Function),
      );
    });

    it('should refuse anyone but the owner before holding the node', async () => {
      const write = jest.fn();

      authenticator.authenticate.mockResolvedValue(
        IdentityIdMother.canonical(),
      );

      await expect(route.write(request, write)).rejects.toThrow(
        AuthenticatedIdentityIsNotNodeOwnerError,
      );
      expect(holder.hold).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    });

    it('should refuse as a non-owner a write that lands after a handover', async () => {
      holder.hold.mockRejectedValue(new NodeCanOnlyBeManagedByItsOwnerError());

      await expect(route.write(request, jest.fn())).rejects.toThrow(
        AuthenticatedIdentityIsNotNodeOwnerError,
      );
    });

    it('should pass on any other failure of the write', async () => {
      const failure = new Error('store failed');

      await expect(
        route.write(request, jest.fn().mockRejectedValue(failure)),
      ).rejects.toBe(failure);
    });
  });

  describe('changeNodeAsOwner', () => {
    it('should run the change for the authenticated owner', async () => {
      const change = jest.fn().mockResolvedValue('changed');

      await expect(route.change(request, change)).resolves.toBe('changed');
      expect(change).toHaveBeenCalledWith(owner);
      expect(holder.hold).not.toHaveBeenCalled();
    });

    it('should refuse anyone but the owner before changing the node', async () => {
      const change = jest.fn();

      authenticator.authenticate.mockResolvedValue(
        IdentityIdMother.canonical(),
      );

      await expect(route.change(request, change)).rejects.toThrow(
        AuthenticatedIdentityIsNotNodeOwnerError,
      );
      expect(change).not.toHaveBeenCalled();
    });

    it('should refuse as a non-owner a change that lands after a handover', async () => {
      await expect(
        route.change(
          request,
          jest
            .fn()
            .mockRejectedValue(new NodeCanOnlyBeManagedByItsOwnerError()),
        ),
      ).rejects.toThrow(AuthenticatedIdentityIsNotNodeOwnerError);
    });
  });

  describe('setUpNodeAsOwnerWhenClaimed', () => {
    it('should let anyone set up a node nobody claimed', async () => {
      const change = jest.fn().mockResolvedValue('set up');

      nodeLoader.loadNode.mockResolvedValue(new NodeMother().build());

      await expect(route.setUp(request, change)).resolves.toBe('set up');
      expect(change).toHaveBeenCalledWith(undefined);
      expect(authenticator.authenticate).not.toHaveBeenCalled();
    });

    it('should run the set-up of a claimed node for its authenticated owner', async () => {
      const change = jest.fn().mockResolvedValue('set up');

      await expect(route.setUp(request, change)).resolves.toBe('set up');
      expect(change).toHaveBeenCalledWith(owner);
    });

    it('should refuse as a non-owner a set-up that lands after a claim', async () => {
      nodeLoader.loadNode.mockResolvedValue(new NodeMother().build());

      await expect(
        route.setUp(
          request,
          jest
            .fn()
            .mockRejectedValue(new NodeCanOnlyBeManagedByItsOwnerError()),
        ),
      ).rejects.toThrow(AuthenticatedIdentityIsNotNodeOwnerError);
    });
  });
});
