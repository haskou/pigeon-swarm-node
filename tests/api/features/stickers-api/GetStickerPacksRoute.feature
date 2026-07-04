Feature: Get sticker packs route
  As an API consumer
  I want to list sticker packs
  So that clients can show available packs

  Background:
    Given I register a private IPFS network "api-stickers-network"

  Scenario: List sticker packs
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I sign the current sticker packs request
    When I GET "/stickers/packs"
    Then response code is equal to 200
    And response body should contain "API stickers"
