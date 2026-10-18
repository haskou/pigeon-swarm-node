Feature: Get sticker user library route
  As an API consumer
  I want to read my sticker library
  So that clients can render saved, favorite and recent stickers

  Background:
    Given I register a test IPFS network "api-stickers-network"

  Scenario: Read my sticker library
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
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
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I sign the current used sticker request
    When I PUT the current sticker usage
    Then response code is equal to 200
    Given I sign the current sticker library request
    When I GET my sticker library
    Then response code is equal to 200
    And response body should contain "savedPacks"
    And response body should contain "favoriteStickers"
    And response body should contain "recentStickers"
    And response body should contain "API stickers secondary"
    And response body should contain "assetCid"

  Scenario: Page my favorite stickers with a cursor
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I remember the current sticker pack
    And I set a static sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 200
    Given I remember the current sticker
    And I sign the current favorite sticker request
    When I PUT the current sticker as favorite
    Then response code is equal to 200
    Given I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1"
    Then response code is equal to 200
    And response lists 1 favorite stickers
    And I remember the response "favoriteStickers" next cursor
    Given I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with the remembered "favoriteStickers" page cursor
    Then response code is equal to 200
    And response lists 0 favorite stickers
    And the response "favoriteStickers" next cursor is null

  Scenario: Page my saved packs independently of my favorite stickers
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    And I remember the current sticker pack
    Given I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    Given I sign the current sticker library request
    When I GET "/stickers/library?savedPacksLimit=1"
    Then response code is equal to 200
    And response lists 1 saved packs
    And I remember the response "savedPacks" next cursor
    Given I sign the current sticker library request
    When I GET "/stickers/library?savedPacksLimit=1&savedPacksCursor=CURSOR" with the remembered "savedPacks" page cursor
    Then response code is equal to 200
    And response lists 0 saved packs
    And the response "savedPacks" next cursor is null

  Scenario: Refuse a sticker library cursor with a forged position
    Given I am an anonymous user
    And I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with the forged "stickers.library.favoriteStickers" cursor at position "not-a-position"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Refuse a sticker library cursor issued for another list
    Given I am an anonymous user
    And I sign the current sticker library request
    When I GET "/stickers/library?savedPacksLimit=1&savedPacksCursor=CURSOR" with the forged "stickers.packs" cursor at position "not-a-position"
    Then response code is equal to 400
    And response body should contain "400110"
