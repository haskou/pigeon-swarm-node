Feature: Get node networks

  Scenario: Read local node networks
    Given the local node has no owner and no networks
    When I GET "/node/networks"
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
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks"
    Then response code is equal to 200

    Given I clear request headers
    When I GET "/node/networks"
    Then response code is equal to 200
    And response body should not contain "key"

  Scenario: Hide private network keys from non-owner identities
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks"
    Then response code is equal to 200

    Given another identity signs the current node networks request
    When I GET "/node/networks"
    Then response code is equal to 200
    And response body should not contain "key"

  Scenario: Hide private network keys when owner identity header is spoofed
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks"
    Then response code is equal to 200

    Given I clear request headers
    And I spoof the current node owner identity header
    When I GET "/node/networks"
    Then response code is equal to 200
    And response body should not contain "key"

  Scenario: Show private network keys to the node owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks"
    Then response code is equal to 200

    Given I sign the current node networks request
    When I GET "/node/networks"
    Then response code is equal to 200
    And response body should contain "key"
    And response data should match partially
      """
      {
        "networks": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "privateNetwork": true
          }
        ]
      }
      """

  Scenario: Show private network flag without keys to non-owner identities
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks"
    Then response code is equal to 200

    Given another identity signs the current node networks request
    When I GET "/node/networks"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "name": "private",
            "privateNetwork": true
          }
        ]
      }
      """
    And response body should not contain "key"

  Scenario: Show public network flag as not private to non-owner identities
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a public node network body with id "550e8400-e29b-41d4-a716-446655440002" and name "public"
    And I sign the current node network request
    When I POST to "/node/networks"
    Then response code is equal to 200

    Given another identity signs the current node networks request
    When I GET "/node/networks"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "name": "public",
            "privateNetwork": false
          }
        ]
      }
      """

  Scenario: Hide the private network flag from anonymous callers
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks"
    Then response code is equal to 200

    Given I clear request headers
    When I GET "/node/networks"
    Then response code is equal to 200
    And response body should not contain "privateNetwork"
