Feature: Put identity route
  As a node owner
  I want a signed identity PUT that creates an identity to pass my registration control
  So that only identities I admit are created on my node

  Scenario: Refuse identity creation over PUT on a closed node
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      { "mode": "closed" }
      """
    And I sign a PUT request to "/node/registration/"
    When I PUT "/node/registration/"
    Then response code is equal to 200
    And I clear request headers
    And the current node has a test network with id "123e4567-e89b-12d3-a456-426614174988" and name "registration-network-88"
    And I set a client-signed identity body with name "closed" and handle "closed"
    And I sign a PUT request for the current identity
    When I PUT the current identity
    Then response code is equal to 403
    And response body should contain "403011"

  Scenario: Refuse identity creation over PUT without a registration code
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      { "mode": "codes" }
      """
    And I sign a PUT request to "/node/registration/"
    When I PUT "/node/registration/"
    Then response code is equal to 200
    And I clear request headers
    And the current node has a test network with id "123e4567-e89b-12d3-a456-426614174989" and name "registration-network-89"
    And I set a client-signed identity body with name "uninvited" and handle "uninvited"
    And I sign a PUT request for the current identity
    When I PUT the current identity
    Then response code is equal to 403
    And response body should contain "403011"

  Scenario: Create an identity over PUT with a registration code and count its use
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      { "mode": "codes" }
      """
    And I sign a PUT request to "/node/registration/"
    When I PUT "/node/registration/"
    Then response code is equal to 200

    Given I set a registration code body with 2 uses expiring in 1 days
    And I sign a POST request to "/node/registration-codes/"
    When I POST to "/node/registration-codes/"
    Then response code is equal to 201
    And I remember the issued registration code
    And I clear request headers
    And the current node has a test network with id "123e4567-e89b-12d3-a456-426614174990" and name "registration-network-90"
    And I set a client-signed identity body with name "invited" and handle "invited"
    And I send the remembered registration code
    And I sign a PUT request for the current identity
    When I PUT the current identity
    Then response code is equal to 200

    Given I sign a GET request to "/node/registration-codes/"
    When I GET "/node/registration-codes/"
    Then response code is equal to 200
    And response data should match partially
      """
      { "codes": [{ "maxUses": 2, "usesLeft": 1 }] }
      """
