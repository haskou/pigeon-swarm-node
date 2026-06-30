import { ApiSwaggerHtml } from '../../../../src/apps/apis/ApiSwaggerHtml';

describe('ApiSwaggerHtml', () => {
  it('should render the aggregated and api swagger urls', () => {
    const html = new ApiSwaggerHtml().build('/api', {
      'calls-api': '/api/swagger/calls-api/swagger.yaml',
      'identities-api': '/api/swagger/identities-api/swagger.yaml',
    });

    expect(html).toContain('"urls.primaryName": \'all-apis\'');
    expect(html).toContain('"name":"all-apis"');
    expect(html).toContain('"url":"/api/swagger/open-api.yaml"');
    expect(html).toContain('"name":"calls-api"');
    expect(html).toContain('"url":"/api/swagger/calls-api/swagger.yaml"');
    expect(html).toContain('"name":"identities-api"');
    expect(html).toContain(
      '"url":"/api/swagger/identities-api/swagger.yaml"',
    );
  });
});
