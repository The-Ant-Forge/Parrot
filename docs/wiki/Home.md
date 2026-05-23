# Parrot Wiki

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/public/icons/owned-128.png" alt="Parrot icon" width="96" />
</p>

Welcome to the Parrot wiki. Parrot is a browser extension that tells you whether the media you're browsing is already in your Plex library — and what's missing from a collection or TV series when you only have part of it.

If you haven't installed Parrot yet, start with **[Installation](Installation)**. If you've already got it running and want to understand what the badge is telling you, jump to **[Badges and Panels](Badges-and-Panels)**.

## Contents

- **[Installation](Installation)** — Install from a release or build from source
- **[Configuration](Configuration)** — Add Plex servers, configure API keys, tune gap detection
- **[Remote Access](Remote-Access)** — Keep the badge working when you're away from home
- **[Badges and Panels](Badges-and-Panels)** — How to read the in-page badge and the popup dashboard
- **[Supported Sites](Supported-Sites)** — Which sites Parrot recognises and what it reads from them
- **[Updating](Updating)** — How the manual + automatic update flow works
- **[Troubleshooting](Troubleshooting)** — Common issues and how to diagnose them

## What it looks like

<table>
  <tr>
    <td><img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/badge-incomplete-collection.png" alt="In-page badge" /></td>
    <td><img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/popup-dashboard-Movie.png" alt="Popup dashboard" width="320" /></td>
  </tr>
  <tr>
    <td align="center"><em>The in-page badge</em></td>
    <td align="center"><em>The popup dashboard</em></td>
  </tr>
</table>

## Companion project

Parrot is a companion to **[ComPlexionist](https://github.com/The-Ant-Forge/ComPlexionist)** — ComPlexionist finds gaps in your Plex library so you can fill them; Parrot stops you from hunting for something you already have.

## Reporting bugs

Open an issue on the [Issues page](https://github.com/The-Ant-Forge/Parrot/issues). If the badge is misbehaving, the most useful thing you can attach is the service worker log: open `chrome://extensions/`, click **Service Worker** under Parrot, reload the page, and copy the output.
