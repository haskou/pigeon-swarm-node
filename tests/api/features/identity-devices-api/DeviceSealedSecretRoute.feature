Feature: Device sealed secret route
  As an identity owner
  I want sealed secrets to be published and delivered only with device proof
  So that unauthenticated callers can neither replace nor read the bundle

  Scenario: Reject a sealed secret publish without device proof
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed owner" and handle "sealed-owner"
    When I POST to "/identities"
    Then response code is equal to 200
    Given I set an unsigned sealed secret bundle body
    When I PUT the current sealed secret bundle
    Then response code is equal to 401

  Scenario: Reject a sealed secret publish with duplicate recipients
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed duplicate" and handle "sealed-duplicate"
    When I POST to "/identities"
    Then response code is equal to 200
    Given I set a duplicate recipient sealed secret bundle body
    And I sign the current sealed secret bundle request
    When I PUT the current sealed secret bundle
    Then response code is equal to 400

  Scenario: Reject a sealed secret delivery without device proof
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed reader" and handle "sealed-reader"
    When I POST to "/identities"
    Then response code is equal to 200
    When I GET the current sealed secret delivery
    Then response code is equal to 401

  Scenario: Return not found for a sealed secret delivery without a bundle
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed empty" and handle "sealed-empty"
    When I POST to "/identities"
    Then response code is equal to 200
    Given I sign the current sealed secret delivery request
    When I GET the current sealed secret delivery
    Then response code is equal to 404

  Scenario: Refuse a replayed sealed secret publish and delivery
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed replay" and handle "sealed-replay"
    When I POST to "/identities"
    Then response code is equal to 200
    Given I set a sealed secret bundle body for my device with generation 1
    And I sign the current sealed secret bundle request
    When I PUT the current sealed secret bundle
    Then response code is equal to 200
    When I PUT the current sealed secret bundle
    Then response code is equal to 401
    And response body should contain "401020"
    Given I sign the current sealed secret delivery request
    When I GET the current sealed secret delivery
    Then response code is equal to 200
    When I GET the current sealed secret delivery
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: Refuse a sealed secret publish and delivery with an expired timestamp
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed stale" and handle "sealed-stale"
    When I POST to "/identities"
    Then response code is equal to 200
    Given requests are signed 61 seconds ago
    And I set a sealed secret bundle body for my device with generation 1
    And I sign the current sealed secret bundle request
    When I PUT the current sealed secret bundle
    Then response code is equal to 401
    And response body should contain "401020"
    Given I sign the current sealed secret delivery request
    When I GET the current sealed secret delivery
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: Hand over the sealed root when a device retires itself
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed handover" and handle "sealed-handover"
    When I POST to "/identities"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    When I POST the current device authorization transition
    Then response code is equal to 200
    Given I set a signed self-retirement transition body for the enrolled device
    And I attach sealed secrets for the remaining devices with generation 2
    When I POST the current device authorization transition
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | revision                            | 2 |
      | sealedSecrets.authorizationRevision | 2 |
      | sealedSecrets.generation            | 2 |
    Given I sign the current sealed secret delivery request
    When I GET the current sealed secret delivery
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | authorizationRevision | 2 |
      | generation            | 2 |

  Scenario: Reject sealed secrets on a transition that does not retire its author
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed enrollment" and handle "sealed-enrollment"
    When I POST to "/identities"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    And I attach sealed secrets for the remaining devices with generation 2
    When I POST the current device authorization transition
    Then response code is equal to 400
    And the genesis device authorization checkpoint exists
