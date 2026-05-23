# Parrot Wiki Source

These markdown files are the source for the GitHub wiki at
<https://github.com/The-Ant-Forge/Parrot/wiki>. They live in the main repo
so they're versioned alongside the code that they document, and any
contributor with a working tree can edit them.

## Publishing to the wiki

GitHub serves the wiki from a separate git repository:
`https://github.com/The-Ant-Forge/Parrot.wiki.git`. To publish updates:

```bash
# One-time setup — clone the wiki repo next to the main repo
cd ..
git clone https://github.com/The-Ant-Forge/Parrot.wiki.git
cd Parrot

# Each update — sync the markdown into the wiki clone, commit, push
cp docs/wiki/*.md docs/wiki/_Sidebar.md ../Parrot.wiki/
cd ../Parrot.wiki
git add .
git commit -m "Update wiki content"
git push
cd ../Parrot
```

(The GitHub wiki only shows pages from the root of the wiki repo, so the
files have to live at the top level there. We keep the canonical copies
under `docs/wiki/` in this repo for versioning + PR review.)

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
