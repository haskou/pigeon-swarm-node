Feature: PUT /push/subscriptions

  Scenario: Register a push subscription for the authenticated identity
    Given I set json body
      """
      {
        "endpoint": "https://push.example.test/send/subscription-id",
        "expirationTime": null,
        "keys": {
          "p256dh": "p256dh-key",
          "auth": "auth-secret"
        }
      }
      """
    And I sign the current push subscription request
    When I PUT "/push/subscriptions"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "endpoint": "https://push.example.test/send/subscription-id",
        "expirationTime": null
      }
      """
