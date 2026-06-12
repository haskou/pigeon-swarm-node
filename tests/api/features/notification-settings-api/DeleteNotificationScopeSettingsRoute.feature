Feature: DELETE /notification-settings/scopes

  Background:
    Given I register an in-memory IPFS network "notification-settings-api-network"

  Scenario: Reset conversation notification settings
    Given I set json body
      """
      {
        "scope": {
          "type": "conversation",
          "conversationId": "one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de"
        },
        "notificationLevel": "none",
        "mutedUntil": null
      }
      """
    And I sign the current notification scope settings request
    When I PUT "/notification-settings/scopes"
    Then response code is equal to 200
    Given I set json body
      """
      {
        "scope": {
          "type": "conversation",
          "conversationId": "one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de"
        }
      }
      """
    And I sign the current notification scope settings reset request
    When I DELETE "/notification-settings/scopes"
    Then response code is equal to 200
    And I sign the current notification settings request
    When I GET "/notification-settings/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "scopes": []
      }
      """
