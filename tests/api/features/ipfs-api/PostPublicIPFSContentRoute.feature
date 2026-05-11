Feature: Post public IPFS content route
  As an API consumer
  I want to publish public binary content to IPFS
  So that identities and messages can reference CIDs instead of embedding base64

  Scenario: Publish public content to IPFS
    Given I am an anonymous user
    And I register an in-memory IPFS network "api-test-network"
    And I set public IPFS content with content type "image/png" and text "hello"
    And I sign the current public IPFS content request
    When I POST to "/ipfs/public"
    Then response code is equal to 201
    And response body should contain "cid"
    And response contains a valid resource with the following fields
      | contentType | image/png   |
      | filename    | avatar.png  |
      | size        | 5           |
