Feature: Get node network debug

  Scenario: Read sanitized local node network debug
    Given the local node has no owner and no networks
    When I GET "/node/network/debug"
    Then response code is equal to 200
    And response body should contain "publicRelay"
    And response body should contain "relayEnabled"
    And response body should contain "listenAddresses"
    And response body should not contain "signature"
    And response body should not contain "ownerDisplayName"
    And response body should not contain "networkIds"
    And response body should not contain "privateKey"
