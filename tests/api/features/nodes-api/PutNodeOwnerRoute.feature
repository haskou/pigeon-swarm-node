Feature: Put node owner

  Scenario: Claim an unowned node
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200
    And response body should contain "owner"

  Scenario: Reject owner changes from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And another identity signs the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 409
