Feature: Node registration codes

  Scenario: Issue, list and revoke a registration code as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a registration code body with 3 uses expiring in 7 days
    And I sign a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 201
    And response header "location" should contain "/node/registration-codes/"
    And response body should contain "code"
    And response data should match partially
      """
      { "maxUses": 3 }
      """
    And the response header "Cache-Control" should be "no-store"
    And I remember the issued registration code

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes"
    Then response code is equal to 200
    And response data should match partially
      """
      { "codes": [{ "maxUses": 3, "usesLeft": 3 }] }
      """
    And response body should not contain "\"code\""
    And response body should not contain "hash"

    Given I sign a DELETE request to the remembered registration code
    When I DELETE the remembered registration code
    Then response code is equal to 204

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes"
    Then response code is equal to 200
    And response data should match exactly
      """
      { "codes": [], "nextCursor": null }
      """

  Scenario: Reject an expiry beyond the allowed lifetime
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      { "expiresAt": 9999999999999 }
      """
    And I sign a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 400
    And response body should contain "400070"

    Given I set a registration code body with 1 uses expiring in 1 days
    And I sign a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 201
    And response data should match partially
      """
      { "maxUses": 1 }
      """

  Scenario: Reject a code with more uses than the node allows
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a registration code body with 101 uses expiring in 1 days
    And I sign a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 400
    And response body should contain "400070"

  Scenario: Reject registration code management from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a registration code body with 1 uses expiring in 1 days
    And another identity signs a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 403
    And response body should contain "403010"

    Given another identity signs a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: A non-owner is refused a valid or forged registration code cursor as a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given another identity signs a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1&cursor=CURSOR" with the cursor for resource "registration-codes" at position "ffffffff-ffff-4fff-bfff-ffffffffffff"
    Then response code is equal to 403
    And response body should contain "403010"

    Given another identity signs a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1" with a forged "registration-codes" cursor at position "not-a-uuid"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: An oversized registration code cursor position is refused
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1&cursor=CURSOR" with the cursor for resource "registration-codes" at a position 257 characters long
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Registration codes page with an opaque cursor and end with a null cursor
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a registration code body with 1 uses expiring in 7 days
    And I sign a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 201

    Given I set a registration code body with 1 uses expiring in 7 days
    And I sign a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 201

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1"
    Then response code is equal to 200
    And response "codes" holds 1 items
    And I remember the response next cursor

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response "codes" holds 1 items
    And I remember the response next cursor

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response "codes" holds 0 items
    And the response next cursor is null

  Scenario: A garbage or foreign registration code cursor is refused
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1&cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1" with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario Outline: A forged registration code cursor is refused
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1" with a forged "registration-codes" cursor at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position                            |
      | not-a-uuid                          |
      | 550e8400-e29b-41d4-a716-44665544003 |

  Scenario: A cursor from the block source list is refused on registration codes
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1&cursor=CURSOR" with the cursor for resource "block-sources" at position "550e8400-e29b-41d4-a716-446655440031"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: A well-formed registration code position after every code reads an empty page
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set a registration code body with 1 uses expiring in 7 days
    And I sign a POST request to "/node/registration-codes"
    When I POST to "/node/registration-codes"
    Then response code is equal to 201

    Given I sign a GET request to "/node/registration-codes"
    When I GET "/node/registration-codes?limit=1&cursor=CURSOR" with the cursor for resource "registration-codes" at position "ffffffff-ffff-4fff-bfff-ffffffffffff"
    Then response code is equal to 200
    And response "codes" holds 0 items
    And the response next cursor is null
