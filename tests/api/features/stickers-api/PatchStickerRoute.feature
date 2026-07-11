Feature: Patch sticker route
  As a sticker pack owner
  I want to update sticker metadata
  So that clients receive the current asset

  Background:
    Given I register a test IPFS network "api-stickers-network"

  Scenario: Update a sticker
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I remember the current sticker pack
    And I set a static sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 200
    Given I remember the current sticker
    And I set an updated sticker body
    And I sign the current sticker update request
    When I PATCH the current sticker
    Then response code is equal to 200
    And response body should contain "bafkreicupdatedstickerassetcid"
