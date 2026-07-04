Feature: DELETE /presence/me/custom-message

  Background:
    Given I register a private IPFS network "presence-api-network"

  Scenario: Clear authenticated identity custom message
    Given I set json body
      """
      {
        "status": "busy",
        "customMessage": "Focus"
      }
      """
    And I sign the current presence update request
    When I PUT "/presence/me"
    Then response code is equal to 200
    Given I sign the current presence custom message deletion request
    When I DELETE "/presence/me/custom-message"
    Then response code is equal to 200
    And response does not contain property "customMessage"
