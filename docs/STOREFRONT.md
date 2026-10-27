# Storefront: GitHub settings only the owner can change

Checked through the GitHub API on 2026-10-27: website empty, no topics, Discussions off. The description
already ends with "Not affiliated with Anthropic."; keep it.

All steps are on https://github.com/supertokenman/supertokenman, signed in as an owner.

## 1. Website

- [ ] On the repository home page, click the gear next to **About** (right column).
- [ ] **Website**: `https://supertokenman.com`
- [ ] Leave the description as it is; it must keep "Not affiliated with Anthropic."
- [ ] Save changes.

## 2. Topics (proposal)

In the same **About** dialog, **Topics**, add (20 max; lowercase, hyphens):

`claude-code`, `claude`, `agent-sdk`, `ai-coding`, `coding-agent`, `macos`, `mac-app`, `electron`,
`react`, `developer-tools`, `git-worktree`, `llm-cost`, `token-usage`, `tool-approval`, `desktop-app`

Left out on purpose: `anthropic` (could read as a brand tie), `open-source` (FSL is not OSI-approved
until each version turns Apache 2.0).

- [ ] Topics added and saved.

## 3. Discussions on

- [ ] **Settings** > **General** > **Features**, tick **Discussions**.
- [ ] Open the new **Discussions** tab and keep the default categories (Announcements, General, Ideas,
      Q&A, Show and tell). `.github/ISSUE_TEMPLATE/config.yml` already points questions there.
- [ ] Pin one welcome post: what the app is, the demo link, "Not affiliated with Anthropic", and where
      bugs and security reports go.

## 4. Private vulnerability reporting

`SECURITY.md` and `CODE_OF_CONDUCT.md` send reports through it.

- [ ] **Settings** > **Code security** (or **Security**) > **Private vulnerability reporting** > **Enable**.

## 5. Social preview image

GitHub asks for PNG, JPG or GIF under 1 MB, at least 640 x 320, best at 1280 x 640 (2:1).
`site/assets/og.png` is 3000 x 1000 (3:1), so it would be cropped; no fitting image is in the repo yet.

- [ ] Make a 1280 x 640 PNG from the site's og image or a real screenshot (`site/assets/screens/`), with
      the name, one line, and "Not affiliated with Anthropic". No Anthropic logo or look.
- [ ] **Settings** > **General** > **Social preview** > **Edit** > **Upload an image**.
- [ ] Optionally commit the source file under `site/assets/` so it can be redone.

## 6. After the settings

- [ ] Read and answer the open issues (ROADMAP "After v1.1" item 1).
- [ ] Check the README badges render: `ci` should be green on main; `proof-mac` shows the last run of
      that workflow, which only runs after a release.
