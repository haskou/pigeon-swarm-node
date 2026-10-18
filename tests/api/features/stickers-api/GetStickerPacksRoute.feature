Feature: Get sticker packs route
  As an API consumer
  I want to list sticker packs
  So that clients can show available packs

  Background:
    Given I register a test IPFS network "api-stickers-network"

  Scenario: List sticker packs
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I sign the current sticker packs request
    When I GET "/stickers/packs"
    Then response code is equal to 200
    And response body should contain "API stickers"

  Scenario: Page sticker packs with a cursor
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I sign the current sticker packs request
    When I GET "/stickers/packs?limit=1"
    Then response code is equal to 200
    And response lists 1 sticker packs
    And I remember the response next cursor
    Given I sign the current sticker packs request
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response lists 1 sticker packs
    And I remember the response next cursor
    Given I sign the current sticker packs request
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response lists 1 sticker packs
    And response next cursor is present

  Scenario: Resume sticker packs after a position that matches no pack
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I sign the current sticker packs request
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with the forged "stickers.packs" cursor at position "99999999999999999|pack-x"
    Then response code is equal to 200
    And response lists 1 sticker packs

  Scenario: Refuse a malformed sticker pack cursor
    Given I am an anonymous user
    When I GET "/stickers/packs?cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Refuse a sticker pack cursor issued for another list
    Given I am an anonymous user
    When I GET "/stickers/packs" with a cursor for another list
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Refuse a sticker library cursor on the sticker packs list
    Given I am an anonymous user
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with the forged "stickers.library.favoriteStickers" cursor at position "99999999999999999|pack-x|sticker-x"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Refuse an oversized sticker pack cursor
    Given I am an anonymous user
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with an oversized cursor
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario: Refuse a sticker pack cursor with an oversized position
    Given I am an anonymous user
    When I GET "/stickers/packs?limit=1" with a "stickers.packs" cursor holding a 257 character position
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario Outline: Refuse a sticker pack cursor in a non-canonical form
    Given I am an anonymous user
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with a non-canonical "stickers.packs" cursor shaped as "<shape>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | shape          |
      | padded         |
      | reordered keys |
      | extra key      |

  Scenario Outline: Refuse a sticker pack cursor with a malformed position
    Given I am an anonymous user
    When I GET "/stickers/packs?limit=1" with a forged "stickers.packs" cursor at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position                    |
      | not-a-timestamp\|pack-1     |
      | 00000000000000001\|         |
      | 00000000000000001\|a\|b     |
      | 00000000000000001\|%7C      |
      | 00000000000000001\|pack 1   |
