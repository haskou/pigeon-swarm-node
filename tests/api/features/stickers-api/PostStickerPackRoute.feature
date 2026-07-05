Feature: Post sticker pack route
  As an API consumer
  I want to create sticker packs
  So that identities can publish reusable stickers

  Background:
    Given I register a test IPFS network "api-stickers-network"

  Scenario: Create a sticker pack
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name | API stickers primary |
    And response body should contain "ownerIdentityId"
