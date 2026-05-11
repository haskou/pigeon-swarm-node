Feature: Get node networks

  Scenario: Read local node networks
    Given the local node has no owner and no networks
    When I GET "/node/networks/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": []
      }
      """

  Scenario: Hide private network keys from anonymous users
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 200

    Given I clear request headers
    When I GET "/node/networks/"
    Then response code is equal to 200
    And response body should not contain "key"

  Scenario: Hide private network keys from non-owner identities
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 200

    Given another identity signs the current node network request
    When I GET "/node/networks/"
    Then response code is equal to 200
    And response body should not contain "key"

  Scenario: Show private network keys to the node owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 200

    When I GET "/node/networks/"
    Then response code is equal to 200
    And response body should contain "key"
