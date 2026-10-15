Feature: Node registration codes

  Scenario: Issue, list and revoke a registration code as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a registration code body with 3 uses expiring in 7 days
    And I sign a POST request to "/node/registration-codes/"
    When I POST to "/node/registration-codes/"
    Then response code is equal to 201
    And response body should contain "code"
    And response data should match partially
      """
      { "maxUses": 3 }
      """
    And the response header "Cache-Control" should be "no-store"
    And I remember the issued registration code

    Given I sign a GET request to "/node/registration-codes/"
    When I GET "/node/registration-codes/"
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

    Given I sign a GET request to "/node/registration-codes/"
    When I GET "/node/registration-codes/"
    Then response code is equal to 200
    And response data should match exactly
      """
      { "codes": [] }
      """

  Scenario: Reject an expiry beyond the allowed lifetime
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set json body
      """
      { "expiresAt": 9999999999999 }
      """
    And I sign a POST request to "/node/registration-codes/"
    When I POST to "/node/registration-codes/"
    Then response code is equal to 400
    And response body should contain "400070"

    Given I set a registration code body with 1 uses expiring in 1 days
    And I sign a POST request to "/node/registration-codes/"
    When I POST to "/node/registration-codes/"
    Then response code is equal to 201
    And response data should match partially
      """
      { "maxUses": 1 }
      """

  Scenario: Reject a code with more uses than the node allows
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a registration code body with 101 uses expiring in 1 days
    And I sign a POST request to "/node/registration-codes/"
    When I POST to "/node/registration-codes/"
    Then response code is equal to 400
    And response body should contain "400070"

  Scenario: Reject registration code management from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given I set a registration code body with 1 uses expiring in 1 days
    And another identity signs a POST request to "/node/registration-codes/"
    When I POST to "/node/registration-codes/"
    Then response code is equal to 403
    And response body should contain "403010"

    Given another identity signs a GET request to "/node/registration-codes/"
    When I GET "/node/registration-codes/"
    Then response code is equal to 403
    And response body should contain "403010"
