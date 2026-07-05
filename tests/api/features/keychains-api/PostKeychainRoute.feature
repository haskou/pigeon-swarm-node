Feature: Post keychain route
  As an API consumer
  I want to publish an encrypted keychain version
  So that my selected node can store and announce my portable secret store

  Scenario: Publish keychain successfully
    Given I am an anonymous user
    And I register a test IPFS network "keychain-api-network"
    And I set json body
      """
      {
        "encryptedPayload": "encrypted-keychain-payload",
        "previousKeychainExternalIdentifier": null,
        "timestamp": 1773848829055,
        "version": 1
      }
      """
    And I sign the current keychain publication request
    When I POST to "/keychains/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | version | 1 |
    And response body should contain "keychainExternalIdentifier"
    And keychain external identifier exists in ipfs
