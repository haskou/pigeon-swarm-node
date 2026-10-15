Feature: Put node blocks

  Background:
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

  Scenario: The owner stores and reads the block list
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 200
    And response body should contain the other identity id

    Given I sign a GET request to "/node/blocks/"
    When I GET "/node/blocks/"
    Then response code is equal to 200
    And response body should contain the other identity id

  Scenario: A non-owner cannot store a block list
    Given I set a node block list body version 1 blocking "owner" owned by the other identity and signed by the other identity
    And another identity signs a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: A non-owner cannot read the block list
    Given another identity signs a GET request to "/node/blocks/"
    When I GET "/node/blocks/"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: A version that is not newer is refused
    Given I set a node block list body version 2 blocking "other"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 200

    Given I set a node block list body version 2 blocking "nobody"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 409
    And response body should contain "NodeBlockListVersionIsNotNewerError"

    Given I set a node block list body version 1 blocking "nobody"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 409
    And response body should contain "NodeBlockListVersionIsNotNewerError"

  Scenario: A list signed by another key is refused
    Given I set a node block list body version 1 blocking "other" owned by the owner identity and signed by the other identity
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 409
    And response body should contain "NodeBlockListSignatureIsNotValidError"

  Scenario: A list owned by another identity is refused
    Given I set a node block list body version 1 blocking "nobody" owned by the other identity and signed by the other identity
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 409
    And response body should contain "NodeBlockListMustBeSignedByCurrentOwnerError"

  Scenario: An over-size list from the owner is refused
    Given the node block list byte limit is 1024
    And I set a node block list body of 2048 bytes
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 413

  Scenario: A non-owner is refused before the body is read
    Given the node block list byte limit is 1024
    And I set a node block list body of 2048 bytes
    And another identity signs a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: A stale request is refused before the body is read
    Given the node block list byte limit is 1024
    And I set a node block list body of 2048 bytes
    And I sign the node blocks request with an expired timestamp
    When I PUT "/node/blocks/"
    Then response code is equal to 401

  Scenario: A blocked identity is refused on signed reads and realtime tickets until unblocked
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 200

    Given another identity signs a GET request to "/conversations/"
    When I GET "/conversations/"
    Then response code is equal to 403
    And response body should contain "403012"

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/v1/tickets"
    When I POST to "/realtime/v1/tickets"
    Then response code is equal to 403
    And response body should contain "403012"

    Given I set a node block list body version 2 blocking "nobody"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/v1/tickets"
    When I POST to "/realtime/v1/tickets"
    Then response code is equal to 201

  Scenario: The owner is never blocked, even when listed
    Given I set a node block list body version 1 blocking "owner,other"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 200

    Given I sign a GET request to "/node/blocks/"
    When I GET "/node/blocks/"
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And I sign a POST request to "/realtime/v1/tickets"
    When I POST to "/realtime/v1/tickets"
    Then response code is equal to 201

  Scenario: A request claiming the owner with a bad signature is refused before validation
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks/"
    And I set a node block list body of 512 bytes
    When I PUT "/node/blocks/"
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: A new owner replaces the previous owner's list whatever its version
    Given I set a node block list body version 9007199254740991 blocking "other"
    And I sign a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 200

    Given I hand the node over to the other identity
    And I set a node block list body version 1 blocking "nobody" owned by the other identity and signed by the other identity
    And another identity signs a PUT request to "/node/blocks/"
    When I PUT "/node/blocks/"
    Then response code is equal to 200
