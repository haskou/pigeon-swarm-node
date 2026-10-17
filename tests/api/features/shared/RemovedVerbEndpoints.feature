Feature: Removed verb-style endpoints

  Scenario Outline: A removed verb-style GET path is only an unknown resource id
    Given I register a test IPFS network "removed-verb-network"
    And I sign a GET request to "<path>"
    When I GET "<path>"
    Then response code is equal to <status>

    Examples:
      | path                  | status |
      | /communities/discover | 409    |
      | /calls/history        | 409    |
      | /calls/ice-servers    | 409    |

  Scenario Outline: A removed verb-style POST endpoint is no longer served
    When I POST to "<path>"
    Then response code is equal to 404

    Examples:
      | path                                                |
      | /communities/community-1/channels/text              |
      | /communities/community-1/channels/voice             |
      | /calls/call-1/participants/me/heartbeat             |
      | /ipfs/public                                        |
      | /node/networks/public                               |
      | /polls/poll-1/close                                 |
      | /stickers/packs/pack-1/stickers/sticker-1/used      |

  Scenario: The removed member kick endpoint is no longer served
    When I DELETE "/communities/community-1/members/member-1/kick"
    Then response code is equal to 404
