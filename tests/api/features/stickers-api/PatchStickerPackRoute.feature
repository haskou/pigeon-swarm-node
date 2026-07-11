Feature: Patch sticker pack route
  As a sticker pack owner
  I want to update my pack profile
  So that its public metadata stays current

  Background:
    Given I register a test IPFS network "api-stickers-network"

  Scenario: Rename a sticker pack
    Given I am an anonymous user
    And I set a sticker pack body
    And I sign the current sticker pack creation request
    When I POST to "/stickers/packs/"
    Then response code is equal to 200
    Given I remember the current sticker pack
    And I set a sticker pack body
    And I sign the current sticker pack update request
    When I PATCH the current sticker pack
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name | API stickers secondary |
