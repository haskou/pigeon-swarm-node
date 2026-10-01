Feature: Device authorization route
  As an identity owner
  I want device authorization transitions to be verified atomically
  So that copied or replayed control messages cannot authorize a device

  Scenario: Enroll a device once with proof of possession
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "device owner" and handle "device-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    And the genesis device authorization checkpoint exists
    Given I set a signed device enrollment transition body
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | revision | 1 |
    And response body should not contain "authorizedCredentialCommitments"
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 409

  Scenario: Reject an undeclared secret on a device authorization transition
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "strict device owner" and handle "strict-device-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    And I add undeclared identity field "recoverySecret"
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 400

  Scenario: Read the authenticated identity authorization checkpoint
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "checkpoint owner" and handle "checkpoint-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 200
    And response is the current device authorization checkpoint

  Scenario: Read the authorization checkpoint during total device recovery
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-recovery-network"
    And I set a client-signed identity body with name "recovery owner" and handle "recovery-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device authorization checkpoint recovery request
    When I GET the current device authorization checkpoint
    Then response code is equal to 200
    And response is the current device authorization checkpoint

  Scenario: Require authentication to read a device authorization checkpoint
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "private owner" and handle "private-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    When I GET the current device authorization checkpoint
    Then response code is equal to 401

  Scenario: Reject a different identity reading a device authorization checkpoint
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "isolated owner" and handle "isolated-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given another identity signs the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 401
