Feature: Post node network

  Scenario: Add a network before the node is owned
    Given the local node has no owner and no networks
    And I set json body
      """
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "public"
      }
      """
    When I POST to "/node/networks/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": [
          {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "public"
          }
        ]
      }
      """

  Scenario: Add a generated public network before the node is owned
    Given the local node has no owner and no networks
    When I POST to "/node/networks/public/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": [
          {
            "name": "public"
          }
        ]
      }
      """

  Scenario: Reject network changes from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And another identity signs the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 403

  Scenario: Add a network as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440001" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 200

  Scenario: Add a generated public network as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I sign the current node public network request
    When I POST to "/node/networks/public/"
    Then response code is equal to 200

  Scenario: Delete a network before the node is owned
    Given the local node has no owner and no networks
    And I set json body
      """
      {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "name": "public"
      }
      """
    When I POST to "/node/networks/"
    Then response code is equal to 200

    When I DELETE "/node/networks/550e8400-e29b-41d4-a716-446655440003/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": []
      }
      """

  Scenario: Delete a network as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440004" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 200

    Given I sign the current node network deletion request for network "550e8400-e29b-41d4-a716-446655440004"
    When I DELETE "/node/networks/550e8400-e29b-41d4-a716-446655440004/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": []
      }
      """

  Scenario: Reject network deletion from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a private node network body with id "550e8400-e29b-41d4-a716-446655440005" and name "private"
    And I sign the current node network request
    When I POST to "/node/networks/"
    Then response code is equal to 200

    Given another identity signs the current node network deletion request for network "550e8400-e29b-41d4-a716-446655440005"
    When I DELETE "/node/networks/550e8400-e29b-41d4-a716-446655440005/"
    Then response code is equal to 403
