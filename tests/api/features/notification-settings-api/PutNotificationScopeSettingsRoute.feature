Feature: PUT /notification-settings/scopes

  Background:
    Given I register an in-memory IPFS network "notification-settings-api-network"

  Scenario: Upsert conversation notification settings
    Given I set json body
      """
      {
        "scope": {
          "type": "conversation",
          "conversationId": "one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de"
        },
        "notificationLevel": "none",
        "mutedUntil": null,
        "suppressEveryoneAndHere": true,
        "suppressRoleMentions": true,
        "mobilePushEnabled": false,
        "hideMutedChannels": true
      }
      """
    And I sign the current notification scope settings request
    When I PUT "/notification-settings/scopes"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "scope": {
          "type": "conversation",
          "conversationId": "one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de"
        },
        "notificationLevel": "none",
        "mutedUntil": null,
        "suppressEveryoneAndHere": true,
        "suppressRoleMentions": true,
        "mobilePushEnabled": false,
        "hideMutedChannels": true
      }
      """
