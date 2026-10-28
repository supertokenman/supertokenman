# Contributing

Thanks for helping. SuperTokenMan is a Mac app (Electron, React, the Claude Agent SDK) that runs Claude
Code panels. Not affiliated with Anthropic.

## Before you start

- Questions and ideas: [Discussions](https://github.com/supertokenman/supertokenman/discussions).
- Bugs and feature requests: open an issue with the matching template.
- Security problems: never in a public issue. See [SECURITY.md](SECURITY.md).

## Build and test

```bash
cd app && npm install && npm start      # run the app
cd app && npm run typecheck && npm test # what CI runs for the app
cd token-kit && npm test                # the tk hooks
cd site && npm run build                # the landing page
```

Details: [app/README.md](app/README.md).

## Pull requests

- One change per pull request, with a test when it changes behaviour.
- Anything that reaches the network gets a line in [docs/NETWORK.md](docs/NETWORK.md).
- Words follow [docs/BRAND.md](docs/BRAND.md): plain English, no hype, no claims we cannot back, and no
  Anthropic logo or look.
- A change to README.md is carried to README.pt-BR.md and README.es.md.
- Never commit secrets, tokens or real customer data. CI runs gitleaks over the whole history.

## Releases

Releases bundle work. A normal release goes out after 3 to 5 feature pull requests, or once a week,
whichever comes first, with one changelog. A fix for security, privacy or network behavior, or for
something broken for people already using the app, goes out on its own right away. Build and publish
in one go, with no merges in between, so the tag matches the binaries.

## License of contributions

The code is under [FSL-1.1-ALv2](LICENSE.md). By opening a pull request you agree that your contribution
is offered under the same license.

## Conduct

Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md).
