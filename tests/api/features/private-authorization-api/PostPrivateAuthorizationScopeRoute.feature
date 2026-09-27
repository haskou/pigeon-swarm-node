Feature: Provision a private authorization scope

  Scenario: Provision an authenticated private scope atomically and idempotently
    Given the current identity owns the node
    And I set a valid private authorization genesis body
    And I sign the current private authorization scope request
    When I POST to "/private-authorization/scopes"
    Then response code is equal to 201
    And response body should contain "accepted"
    And the private authorization scope is durably provisioned
    Given I sign the current private authorization scope request
    When I POST to "/private-authorization/scopes"
    Then response code is equal to 200
    And response body should contain "duplicate"

  Scenario: Reject provisioning from an identity that does not own the node
    Given the current identity owns the node
    And I set a valid private authorization genesis body
    And another identity signs the current private authorization scope request
    When I POST to "/private-authorization/scopes"
    Then response code is equal to 403

  Scenario: Parse a valid projection larger than the operation envelope limit
    Given the current identity owns the node
    And I set a valid private authorization genesis body
    And I add a large valid channel to the private authorization projection
    And I sign the current private authorization scope request
    When I POST to "/private-authorization/scopes"
    Then response code is equal to 201
    And the private authorization scope is durably provisioned
