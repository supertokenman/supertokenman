# SuperTokenMan

<img src="assets/logo.svg" width="96" alt="SuperTokenMan mascot"> <img src="assets/fight.svg" width="192" alt="SuperTokenMan knocking out a wasted token">

A Claude Code mod that keeps your token economy on screen. It is open the moment a session starts:

- **HUD above the prompt**, always visible, drawn like a fighting game: the context is your HP bar and drains as it fills; the 5-hour and 7-day plan windows are stamina bars; the prompt cache is the round timer (minutes left, flashing when cold); the session's value at API prices is the score; token-kit's savings and its KO count sit under it. Desktop draws it as one animated SVG; the terminal draws the same figures with block bars.
- **Fights**: each time token-kit cuts a command's output, SuperTokenMan knocks out the wasted tokens on screen for about 4 seconds: a punch, the gray token bursts, `KO! -10k wasted tok +R$0.40` (the tokens cut and what writing them to the cache would have cost). The SVG fight (`assets/fight.svg`) plays where the surface draws SVG; the terminal plays it as text frames. Surfaces that draw no band get a toast, at most once a minute.
- **Details pane** (the Details button, or `/supertokenman`): a character sheet with the same stats, a warning when the cache has gone cold and the next message re-reads everything at full price, and the biggest enemies: the tool results that cost most because every later request re-reads them, each with its own health bar.

Money uses API list prices per model and the day's exchange rate (BRL by default, or token-kit's `money.currency`). On a subscription that is the value of the work, not the bill. Savings come from token-kit's stats when token-kit is installed; without it they show zero.

The mascot (`assets/logo.svg`) is an original pixel character in Claude colors: a terracotta token hero with a dark waving cape and a cream T emblem. It bobs, blinks and waves where the surface plays SVG animation.

## Install

From a shell:

```
claude plugin marketplace add arimayuji/CLI
claude plugin install supertokenman@arimayuji
```

Later versions:

```
claude plugin marketplace update arimayuji
claude plugin update supertokenman@arimayuji
```

Then start a new local session. In the desktop app: + next to the prompt box, Plugins, Add marketplace `arimayuji/CLI`, then Add plugin. Mods draw in local sessions only, not in cloud sessions.
