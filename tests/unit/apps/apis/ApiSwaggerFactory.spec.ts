import { ApiSwaggerFactory } from '../../../../src/apps/apis/ApiSwaggerFactory';

describe('ApiSwaggerFactory', () => {
  let factory: ApiSwaggerFactory;

  beforeEach(() => {
    factory = new ApiSwaggerFactory();
  });

  describe('createByApi', () => {
    it('should load one yaml document per api folder', () => {
      const specs = factory.createByApi();

      expect(Object.keys(specs)).toEqual([
        'calls-api',
        'communities-api',
        'conversations-api',
        'identities-api',
        'ipfs-api',
        'keychains-api',
        'nodes-api',
        'notifications-api',
        'presence-api',
        'push-api',
        'stickers-api',
      ]);
      expect(specs['calls-api']).toContain('/calls/:');
      expect(specs['communities-api']).toContain('/communities/:');
      expect(specs['conversations-api']).toContain('/conversations:');
      expect(specs['identities-api']).toContain('/identities/:');
      expect(specs['ipfs-api']).toContain('/ipfs/{cid}:');
      expect(specs['keychains-api']).toContain('/keychains/:');
      expect(specs['nodes-api']).toContain('/node/:');
      expect(specs['notifications-api']).toContain('/notifications/:');
      expect(specs['presence-api']).toContain('/presence/:');
      expect(specs['push-api']).toContain('/push/subscriptions:');
      expect(specs['stickers-api']).toContain('/stickers/packs:');
    });
  });

  describe('createAggregatedSpec', () => {
    it('should load the aggregated yaml document', () => {
      const spec = factory.createAggregatedSpec();

      expect(spec).toContain('title: Pigeon-swarm APIs');
      expect(spec).toContain(
        "$ref: './calls-api/swagger.yaml#/paths/~1calls~1'",
      );
      expect(spec).toContain(
        "$ref: './conversations-api/swagger.yaml#/paths/~1conversations'",
      );
      expect(spec).toContain(
        "$ref: './identities-api/swagger.yaml#/paths/~1identities~1'",
      );
      expect(spec).toContain(
        "$ref: './ipfs-api/swagger.yaml#/paths/~1ipfs~1{cid}'",
      );
      expect(spec).toContain(
        "$ref: './keychains-api/swagger.yaml#/paths/~1keychains~1'",
      );
      expect(spec).toContain(
        "$ref: './nodes-api/swagger.yaml#/paths/~1node~1'",
      );
      expect(spec).toContain(
        "$ref: './notifications-api/swagger.yaml#/paths/~1notifications~1'",
      );
      expect(spec).toContain(
        "$ref: './presence-api/swagger.yaml#/paths/~1presence~1'",
      );
      expect(spec).toContain(
        "$ref: './push-api/swagger.yaml#/paths/~1push~1subscriptions'",
      );
      expect(spec).toContain(
        "$ref: './stickers-api/swagger.yaml#/paths/~1stickers~1packs'",
      );
    });
  });

  describe('createRouteByApi', () => {
    it('should create routes for each api swagger file', () => {
      const routes = factory.createRouteByApi('/api');

      expect(routes).toEqual({
        'calls-api': '/api/swagger/calls-api/swagger.yaml',
        'communities-api': '/api/swagger/communities-api/swagger.yaml',
        'conversations-api': '/api/swagger/conversations-api/swagger.yaml',
        'identities-api': '/api/swagger/identities-api/swagger.yaml',
        'ipfs-api': '/api/swagger/ipfs-api/swagger.yaml',
        'keychains-api': '/api/swagger/keychains-api/swagger.yaml',
        'nodes-api': '/api/swagger/nodes-api/swagger.yaml',
        'notifications-api': '/api/swagger/notifications-api/swagger.yaml',
        'presence-api': '/api/swagger/presence-api/swagger.yaml',
        'push-api': '/api/swagger/push-api/swagger.yaml',
        'stickers-api': '/api/swagger/stickers-api/swagger.yaml',
      });
    });
  });
});
