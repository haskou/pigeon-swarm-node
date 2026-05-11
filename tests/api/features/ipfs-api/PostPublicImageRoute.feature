Feature: Post public image route
  As an API consumer
  I want to publish public profile images to IPFS
  So that identities can reference image CIDs instead of embedding base64

  Scenario: Publish a public image to IPFS
    Given I am an anonymous user
    And I register an in-memory IPFS network "api-test-network"
    And I set a public image body with content type "image/png" and base64 data "aGVsbG8="
    And I sign the current public image upload request
    When I POST to "/ipfs/public-images"
    Then response code is equal to 201
    And response body should contain "cid"
    And response contains a valid resource with the following fields
      | contentType | image/png |
      | size        | 5         |
