Fixes that were promised in 0.1.4 and missed, and clearer meters.

- Switching the model of a panel that was asleep no longer fails with "Query closed before response
  received"; the panel wakes with the new model. (Listed in 0.1.4, but it had not shipped.)
- In a narrow panel the tabs and the close button always show whole. (Also listed in 0.1.4.)
- The update notice no longer covers the composer: a small card under the top bar, with the version
  and a progress bar.
- The panel meter says "CONTEXT LEFT" and shows tokens of the window ("34k of 1.0M").
- Each release is now checked on a Mac by CI: download, signature, a decoy secret and every host the
  app reaches. The report is attached to the release.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
