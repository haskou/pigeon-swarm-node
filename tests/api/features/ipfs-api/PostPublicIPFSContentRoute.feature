Feature: Post public IPFS content route
  As an API consumer
  I want to publish public binary content to IPFS
  So that identities and messages can reference CIDs instead of embedding base64

  Scenario: Publish public content to IPFS
    Given I am an anonymous user
    And I register a test IPFS network "api-test-network"
    And I set raw IPFS content with content type "image/png" and text "hello"
    And I sign the current public IPFS content request
    When I POST to "/ipfs/public"
    Then response code is equal to 201
    And response body should contain "cid"
    And response contains a valid resource with the following fields
      | contentType | image/png   |
      | filename    | avatar.png  |
      | size        | 5           |
    When I GET the published IPFS content as binary
    Then response code is equal to 200
    And response header "content-type" should contain "image/png"
    And response header "content-disposition" should contain "avatar.png"
    And binary response body should be "hello"
