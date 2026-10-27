A pass over the whole app: tooltips, controls, setup guides, and the bugs found on the way.

- Tooltips everywhere, top bar included. Fields, selects, checkboxes and file pickers in the app's
  own look; buttons take their own width; lighter error notes.
- Panels animate when they open, move and close.
- Setup guides as steps with one action each; tools installed from inside the app; an in-app folder
  picker with recent projects and repos found on disk.
- One table and status pill style, row actions you can see, empty states, icons in the catalog.
- Markets: symbol search with suggestions (listed in the Security page's network list).
- Fixed: Health double counting, repeated rows in Ports, the Cloud toggle over its label, repeated
  Diagnostics errors, Today's timeline labels, Markets titles cut mid-word, a slow apps sidebar.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
