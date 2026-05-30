Feature: POST /push/test

  Scenario: Send a diagnostic test push to a registered subscription
    Given I set json body
      """
      {
        "endpoint": "https://web.push.apple.com/send/subscription-id",
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
    Given I set json body
      """
      {
        "endpoint": "https://web.push.apple.com/send/subscription-id"
      }
      """
    And I sign the current push test request
    When I POST to "/push/test"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "deliveries": [
          {
            "endpoint": "https://web.push.apple.com/send/subscription-id",
            "endpointHost": "web.push.apple.com",
            "delivered": false,
            "removed": false
          }
        ]
      }
      """
