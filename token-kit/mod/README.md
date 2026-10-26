# SuperTokenMan

A Claude Code mod that keeps your token economy on screen. It is open the moment a session starts:

- **Widget above the prompt** (terminal and Desktop Code tab), always visible: context fill, 5-hour and 7-day plan windows, minutes left on the prompt cache, the session's value at API prices and what token-kit saved, in your currency. Values past 80% turn orange.
- **Details pane** (the Details button, or `/supertokenman`): bars for context and plan windows, a warning when the cache has gone cold and the next message re-reads everything at full price, and the tool results that cost most because every later request re-reads them.

Money uses API list prices per model and the day's exchange rate (BRL by default, or token-kit's `money.currency`). On a subscription that is the value of the work, not the bill. Savings come from token-kit's stats when token-kit is installed; without it they show zero.
