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
    Given I sign the current sticker packs request
    When I GET "/stickers/packs?limit=1"
    Then response code is equal to 200
    And response lists 1 sticker packs
    And I remember the response next cursor
    Given I sign the current sticker packs request
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response lists 1 sticker packs
    And response next cursor is present
    Given I sign the current sticker packs request
    When I GET "/stickers/packs?limit=1&cursor=CURSOR" with the remembered page cursor
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

  Scenario: Refuse a sticker pack cursor with a forged position
    Given I am an anonymous user
    When I GET "/stickers/packs?limit=1" with a forged "stickers.packs" cursor at position "not-a-position"
    Then response code is equal to 400
    And response body should contain "400110"
