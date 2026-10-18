Feature: Put node owner

  Scenario: Claim an unowned node
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200
    And response body should contain "owner"

  Scenario: Reject owner changes from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And another identity signs the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 409

  Scenario: The operator replaces a lost owner and no one else can claim the node
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given the node operator replaced the lost node owner with the other identity while the node was stopped
    When I GET "/node"
    Then response code is equal to 200
    And response body should contain the other identity id

    Given I set json body
      """
      {}
      """
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 409
    And the local node is owned by the other identity

  Scenario: A restart clears an alias owner and refuses every claim until the operator resets the node
    Given the local node owner was stored under "an alias DER prefix" of my key
    When the node restarts
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 403
    And response body should contain "403013"

    When the node restarts
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 403

    Given the node operator replaced the lost node owner with the other identity while the node was stopped
    Given I set json body
      """
      {}
      """
    And another identity signs the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200
