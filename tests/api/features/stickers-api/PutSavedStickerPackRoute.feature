Feature: Put saved sticker pack route
  As an API consumer
  I want to save and remove sticker packs
  So that identities can manage their sticker libraries

  Background:
    Given I register a test IPFS network "api-stickers-network"

  Scenario: Save and remove a sticker pack
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I remember the current sticker pack
    And I sign the current saved sticker pack removal request
    When I DELETE the current saved sticker pack
    Then response code is equal to 200
    And response body should not contain "API stickers"
    Given I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    Given I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs"
    Then response code is equal to 201
    Given I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    And response body should contain "API stickers primary"
    And response body should contain "API stickers secondary"

  Scenario Outline: Refuse to save a sticker pack whose id is "<packId>"
    Given I am an anonymous user
    And I remember the sticker pack id "<packId>"
    And I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 409
    And response body should contain "InvalidStickerIdError"

    Examples:
      | packId                                |
      | pack:one                              |
      | pack\|one                             |
      | pack.one                              |
      | abcdefghijklmnopqrstuvwxyz0123456789A |
