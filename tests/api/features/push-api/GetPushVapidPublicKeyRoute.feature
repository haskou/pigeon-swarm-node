Feature: GET /push/vapid-public-key

  Scenario: Read push public key configuration
    When I GET "/push/vapid-public-key"
    Then response code is equal to 200
    And response body should contain "enabled"
    And response body should contain "publicKey"
