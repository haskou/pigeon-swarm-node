Feature: Device sealed secret route
  As an identity owner
  I want sealed secrets to be published and delivered only with device proof
  So that unauthenticated callers can neither replace nor read the bundle

  Scenario: Reject a sealed secret publish without device proof
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed owner" and handle "sealed-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set an unsigned sealed secret bundle body
    When I PUT the current sealed secret bundle
    Then response code is equal to 401

  Scenario: Reject a sealed secret publish with duplicate recipients
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed duplicate" and handle "sealed-duplicate"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a duplicate recipient sealed secret bundle body
    And I sign the current sealed secret bundle request
    When I PUT the current sealed secret bundle
    Then response code is equal to 400

  Scenario: Reject a sealed secret delivery without device proof
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed reader" and handle "sealed-reader"
    When I POST to "/identities/"
    Then response code is equal to 200
    When I GET the current sealed secret delivery
    Then response code is equal to 401

  Scenario: Return not found for a sealed secret delivery without a bundle
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "sealed-secret-network"
    And I set a client-signed identity body with name "sealed empty" and handle "sealed-empty"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current sealed secret delivery request
    When I GET the current sealed secret delivery
    Then response code is equal to 404
