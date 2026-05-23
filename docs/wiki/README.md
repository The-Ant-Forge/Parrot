# Parrot Wiki Source

These markdown files are the source for the GitHub wiki at
<https://github.com/The-Ant-Forge/Parrot/wiki>. They live in the main repo
so they're versioned alongside the code that they document, and any
contributor with a working tree can edit them.

## Publishing to the wiki

GitHub serves the wiki from a separate git repository:
`https://github.com/The-Ant-Forge/Parrot.wiki.git`.

### One-time setup

Clone the wiki repo next to the main repo:

```bash
cd ..
git clone https://github.com/The-Ant-Forge/Parrot.wiki.git
cd Parrot
```

If the clone fails with "Repository not found", the wiki repo hasn't been
bootstrapped yet. Open <https://github.com/The-Ant-Forge/Parrot/wiki>
and create any page via the web UI (title `Home`, body anything) —
that provisions the underlying `.wiki.git` repo. Then retry the clone.

### Syncing

```bash
npm run wiki:sync                    # default commit message
npm run wiki:sync -- "your message"  # custom commit message
```

The script copies every `*.md` file from `docs/wiki/` (except this
README) into the wiki clone, then commits and pushes. If there are no
changes, it exits cleanly without making an empty commit.

(GitHub renders pages from the root of the wiki repo, so files have to
live at the top level there. We keep the canonical copies under
`docs/wiki/` in this repo for versioning + PR review.)

## Image links

All wiki pages use absolute `raw.githubusercontent.com` URLs for images,
e.g.:

```markdown
![](https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/popup-not-configured.png)
```

This way the images render correctly from the wiki repo without needing
to duplicate the screenshot files.

## Page list

- `Home.md` — Wiki landing page
- `Installation.md`
- `Configuration.md`
- `Remote-Access.md`
- `Badges-and-Panels.md`
- `Supported-Sites.md`
- `Updating.md`
- `Troubleshooting.md`
- `_Sidebar.md` — Left-nav (rendered on every wiki page by GitHub)

To add a new page: drop a `Something.md` file in this directory, optionally
add it to `_Sidebar.md`, and re-run the publish step above.
