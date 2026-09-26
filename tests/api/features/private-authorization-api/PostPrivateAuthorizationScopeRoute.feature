Feature: Provision a private authorization scope

  Scenario: Provision an authenticated private scope atomically and idempotently
    Given I set a valid private authorization genesis body
    And I sign the current private authorization scope request
    When I POST to "/private-authorization/scopes"
    Then response code is equal to 201
    And response body should contain "accepted"
    And the private authorization scope is durably provisioned
    Given I sign the current private authorization scope request
    When I POST to "/private-authorization/scopes"
    Then response code is equal to 200
    And response body should contain "duplicate"
