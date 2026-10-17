Feature: Put node registration mode

  Scenario: Change the registration mode as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      { "mode": "codes" }
      """
    And I sign a PUT request to "/node/registration"
    When I PUT "/node/registration"
    Then response code is equal to 200
    And response data should match exactly
      """
      { "mode": "codes" }
      """
    When I GET "/node"
    Then response code is equal to 200
    And response data should match partially
      """
      { "registration": { "mode": "codes" } }
      """

  Scenario: Reject an unknown registration mode
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      { "mode": "invite" }
      """
    And I sign a PUT request to "/node/registration"
    When I PUT "/node/registration"
    Then response code is equal to 400

  Scenario: Reject registration mode changes from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      { "mode": "closed" }
      """
    And another identity signs a PUT request to "/node/registration"
    When I PUT "/node/registration"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: Reject registration mode changes before the node is claimed
    Given the local node has no owner and no networks
    And I set json body
      """
      { "mode": "closed" }
      """
    And I sign a PUT request to "/node/registration"
    When I PUT "/node/registration"
    Then response code is equal to 403
    And response body should contain "403010"
