Feature: Put saved sticker pack route
  As an API consumer
  I want to save and remove sticker packs
  So that identities can manage their sticker libraries

  Scenario: Save and remove a sticker pack
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
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
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I sign the current saved sticker pack request
    When I PUT the current sticker pack as saved
    Then response code is equal to 200
    And response body should contain "API stickers primary"
    And response body should contain "API stickers secondary"
