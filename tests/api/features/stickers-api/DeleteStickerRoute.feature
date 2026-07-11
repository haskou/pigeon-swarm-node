Feature: Delete sticker route
  As a sticker pack owner
  I want to remove a sticker
  So that it is no longer distributed with the pack

  Background:
    Given I register a test IPFS network "api-stickers-network"

  Scenario: Remove a sticker from a pack
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
    And I sign the current sticker removal request
    When I DELETE the current sticker
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "stickers": []
      }
      """
