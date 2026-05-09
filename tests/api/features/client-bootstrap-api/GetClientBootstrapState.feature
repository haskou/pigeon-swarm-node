Feature: Get client bootstrap state

  Scenario: Read identity keychain and conversations through the API
    Given I register an in-memory IPFS network "client-bootstrap-network"
    And I have created a one-to-one conversation
    And I sign the current identity keychain request
    When I GET the authenticated identity keychain
    Then response code is equal to 200
    And response body should contain "encrypted-keychain-payload"
    And response body should contain "keychainExternalIdentifier"
    And I sign the current conversations request
    When I GET current conversations
    Then response code is equal to 200
    And response body should contain "one-to-one:"
