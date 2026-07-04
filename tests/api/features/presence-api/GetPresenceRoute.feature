Feature: GET /presence

  Background:
    Given I register a private IPFS network "presence-api-network"

  Scenario: Read current identity presence
    Given I set json body
      """
      {
        "status": "available",
        "customMessage": "Ready"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 200
    Given I sign the current identity presence request
    When I GET the current identity presence
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "status": "available",
        "customMessage": "Ready"
      }
      """

  Scenario: List current identity presence
    Given I sign the current presence list request
    When I GET the current presence list
    Then response code is equal to 200
    And response body is an array with length of 1
