Feature: Get sticker user library route
  As an API consumer
  I want to read my sticker library
  So that clients can render saved, favorite and recent stickers

  Background:
    Given I register a private IPFS network "api-stickers-network"

  Scenario: Read my sticker library
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
    And I sign the current favorite sticker request
    When I PUT the current sticker as favorite
    Then response code is equal to 200
    Given I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I sign the current used sticker request
    When I POST the current sticker as used
    Then response code is equal to 200
    Given I sign the current sticker library request
    When I GET my sticker library
    Then response code is equal to 200
    And response body should contain "savedPacks"
    And response body should contain "favoriteStickers"
    And response body should contain "recentStickers"
    And response body should contain "API stickers secondary"
    And response body should contain "assetCid"
