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

  Scenario: Walk every favorite sticker one page at a time
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
    Given I set a static sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 200
    Given I remember the sticker I just created
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
    And response lists 1 favorite stickers
    And I remember the response "favoriteStickers" next cursor
    Given I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with the remembered "favoriteStickers" page cursor
    Then response code is equal to 200
    And response lists 0 favorite stickers
    And the response "favoriteStickers" next cursor is null

  Scenario: Replayed favorite sticker cursor lists only the replaying identity's favorites
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
    Given I remember the sticker I just created
    And I sign the current favorite sticker request
    When I PUT the current sticker as favorite
    Then response code is equal to 200
    Given I remember the current identity and sticker
    And I switch to a new identity
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I remember the current sticker pack
    And I set a static sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 200
    Given I remember the sticker I just created
    And I sign the current favorite sticker request
    When I PUT the current sticker as favorite
    Then response code is equal to 200
    Given I set a static sticker body
    And I sign the current sticker creation request
    When I POST to the current sticker pack stickers
    Then response code is equal to 200
    Given I remember the sticker I just created
    And I sign the current favorite sticker request
    When I PUT the current sticker as favorite
    Then response code is equal to 200
    Given I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1"
    Then response code is equal to 200
    And response lists 1 favorite stickers
    And I remember the response "favoriteStickers" next cursor
    Given I restore the remembered identity and sticker
    And I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=10&favoriteStickersCursor=CURSOR" with the remembered "favoriteStickers" page cursor
    Then response code is equal to 200
    And response lists 1 favorite stickers
    And the response first favorite sticker is the remembered one

  Scenario: Replayed saved pack cursor lists only the replaying identity's packs
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I remember the current sticker pack
    And I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    Given I remember the current identity and sticker
    And I switch to a new identity
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I remember the current sticker pack
    And I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    Given I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I remember the current sticker pack
    And I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    Given I sign the current sticker library request
    When I GET "/stickers/library?savedPacksLimit=1"
    Then response code is equal to 200
    And response lists 1 saved packs
    And I remember the response "savedPacks" next cursor
    Given I restore the remembered identity and sticker
    And I sign the current sticker library request
    When I GET "/stickers/library?savedPacksLimit=10&savedPacksCursor=CURSOR" with the remembered "savedPacks" page cursor
    Then response code is equal to 200
    And response lists 1 saved packs
    And the response first saved pack is the remembered sticker pack

  Scenario: Refuse a favorite stickers cursor used as a saved packs cursor
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
    And I remember the response "favoriteStickers" next cursor
    Given I sign the current sticker library request
    When I GET "/stickers/library?savedPacksLimit=1&savedPacksCursor=CURSOR" with the remembered "favoriteStickers" page cursor
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Refuse a saved packs cursor used as a favorite stickers cursor
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    And I remember the current sticker pack
    Given I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    Given I set a sticker pack body
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
    And I remember the response "savedPacks" next cursor
    Given I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with the remembered "savedPacks" page cursor
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Resume my favorite stickers after a position that matches no favorite
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
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with the forged "stickers.library.favoriteStickers" cursor at position "17280000000000000|pack-x|sticker-x"
    Then response code is equal to 200
    And response lists 1 favorite stickers

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

  Scenario: Refuse an oversized sticker library cursor
    Given I am an anonymous user
    And I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with an oversized cursor
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Refuse a sticker library cursor with an oversized position
    Given I am an anonymous user
    And I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with a "stickers.library.favoriteStickers" cursor holding a 257 character position
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario Outline: Refuse a sticker library cursor in a non-canonical form
    Given I am an anonymous user
    And I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with a non-canonical "stickers.library.favoriteStickers" cursor shaped as "<shape>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | shape          |
      | padded         |
      | reordered keys |
      | extra key      |

  Scenario Outline: Refuse a favorite sticker cursor with a malformed position
    Given I am an anonymous user
    And I sign the current sticker library request
    When I GET "/stickers/library?favoriteStickersLimit=1&favoriteStickersCursor=CURSOR" with the forged "stickers.library.favoriteStickers" cursor at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position                                 |
      | 00000000000000001\|pack-1                |
      | 00000000000000001\|pack-1\|sticker-1\|x  |
      | not-a-timestamp\|pack-1\|sticker-1       |
      | 00000000000000001\|%7C\|sticker-1       |
      | 00000000000000001\|pack-1\|             |
