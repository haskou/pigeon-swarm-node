Feature: Node diagnostics session

  Scenario: Open, export and end a consented diagnostics session as the owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      {
        "consent": true,
        "minutes": 15
      }
      """
    And I sign the current node diagnostics "PUT" request
    When I PUT "/node/diagnostics"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "entries": []
      }
      """

    Given I sign the current node diagnostics "GET" request
    When I GET "/node/diagnostics"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "entries": []
      }
      """

    Given I sign the current node diagnostics "DELETE" request
    When I DELETE "/node/diagnostics"
    Then response code is equal to 204

    Given I sign the current node diagnostics "GET" request
    When I GET "/node/diagnostics"
    Then response code is equal to 409

  Scenario: Refuse a diagnostics session without consent
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      {
        "consent": false,
        "minutes": 15
      }
      """
    And I sign the current node diagnostics "PUT" request
    When I PUT "/node/diagnostics"
    Then response code is equal to 409

  Scenario: Refuse diagnostics from an identity that does not own the node
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      {
        "consent": true,
        "minutes": 15
      }
      """
    And another identity signs the current node diagnostics "PUT" request
    When I PUT "/node/diagnostics"
    Then response code is equal to 403

  Scenario: Refuse diagnostics while the node has no owner
    Given the local node has no owner and no networks
    And I set json body
      """
      {
        "consent": true,
        "minutes": 15
      }
      """
    And I sign the current node diagnostics "PUT" request
    When I PUT "/node/diagnostics"
    Then response code is equal to 403

  Scenario: Refuse a replayed owner-signed request to open a diagnostics session
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

    Given I set json body
      """
      {
        "consent": true,
        "minutes": 15
      }
      """
    And I sign the current node diagnostics "PUT" request
    And I remember the current node diagnostics request
    When I PUT "/node/diagnostics"
    Then response code is equal to 200
    And I remember the opened node diagnostics session

    When I replay the remembered node diagnostics PUT
    Then response code is equal to 401

    Given I sign the current node diagnostics "GET" request
    When I GET "/node/diagnostics"
    Then response code is equal to 200
    And the node diagnostics session is the remembered one
