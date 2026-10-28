Panels that work together, with a price on every link.

- Canvas: a new layout where panels are cards you move, pan and zoom, with the links between them
  drawn and labelled (auto or waits, and what the link cost today). Pick it with the layout button.
- `stm read <panel>`: a panel reads a linked panel's goal and the end of its last reply, read only,
  credentials masked. Unlinked panels cannot read each other.
- What a link costs: turns started by messages over a link count against it today, in dollars,
  tokens and turns. The linked: chip shows it and sets a daily cap; over the cap, the link refuses.
- `stm loop <build> <review>`: a review loop. Each build reply goes to the review panel and the
  review comes back, until APPROVED, a round limit (up to 10) or a spend cap (up to $50). Start it
  from your own terminal; every step still asks before edits and commands.
- `stm learn`: notes you send back with Deny with a note become proposed lines for the project's
  CLAUDE.local.md, most repeated first. Nothing is written until you pick them.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
