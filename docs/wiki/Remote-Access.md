# Remote Access

By default Parrot expects your Plex server to be on the same network as the browser. When you travel — or even just visit a coffee shop — the LAN IP stops resolving and the badge silently falls back to "not in library".

Parrot can keep working remotely **without** requiring:

- Manual port forwarding
- A VPN install (Tailscale, WireGuard, etc.)
- A Plex Pass (browsing metadata is free; only streaming is gated)

The only prerequisite is that **Plex Remote Access is enabled on your server** — the setting Plex strongly encourages anyway, used by the official Plex apps to reach your server outside the LAN.

## How it works

When you save a Plex server in options, Parrot calls the official `plex.tv/api/v2/resources` discovery endpoint with your token. The response contains every server you have access to, each with a list of connection candidates (LAN IP, public `.plex.direct` URL, Plex Relay). Parrot picks the first non-local, non-relay candidate and stores it as the server's **Remote URL**.

At runtime, every call to your Plex server goes through a small wrapper that tries URLs in order:

1. **Last working URL** from this session (if any)
2. **Configured local URL** (`serverUrl`)
3. **Auto-detected Remote URL** (`remoteUrl`)

The first attempt that returns a Response wins; only network errors / timeouts trigger fallback. The working URL is remembered for the rest of the service worker session, so subsequent calls don't pay the timeout cost. The memo resets naturally on service worker unload — so a laptop sleep/wake or a home/away transition re-probes on the next request.

## Setting it up

<img src="https://raw.githubusercontent.com/The-Ant-Forge/Parrot/master/docs/screenshots/options-remote-url.png" alt="Remote URL field with auto-detect button" width="540" />

In the Plex Servers options card, when you add or edit a server you'll see a **Remote URL** field beneath the Server URL and Token fields:

1. Enter your local URL and token as usual
2. Leave the Remote URL blank if you want it auto-detected on save, or click **Auto-detect** to fetch it immediately
3. Click **Save Server**

If auto-detection succeeds, the field is filled in with something like `https://192-168-1-100.abcdef0123.plex.direct:32400`. If it fails (because Remote Access isn't enabled, or your token doesn't have account-level scope), the field stays empty and you can paste a URL manually.

## Editing manually

The Remote URL is a plain text field — you can edit it any time:

- **Public IP rotated** — Plex's `.plex.direct` URLs encode the public IP. When your ISP rotates the public IP, the URL becomes stale. Either click **Auto-detect** again, or paste a new URL
- **Custom domain** — If you have your own dynamic-DNS hostname pointing at your home Plex (e.g. `plex.mydomain.com`), put that here instead. More stable than `.plex.direct`
- **Disable remote access** — Leave the field blank to skip the fallback entirely

## What works remotely

| Feature | Works remotely? |
|---------|-----------------|
| Badge state (owned / not owned) | ✅ Yes — uses the cached index, no live call |
| Ratings + resolution | ✅ Yes — uses community proxies, not your server |
| Collection gaps | ✅ Yes |
| Episode gaps | ✅ Yes (live fetch via Remote URL) |
| Library refresh | ✅ Yes (slower than LAN, but works) |
| Deep links to Plex Web | ✅ Yes — they're `app.plex.tv` URLs, not server URLs |

## Plex Pass note

As of mid-2026, Plex has restricted **remote streaming** to Plex Pass / Remote Watch Pass holders. Browsing the library API — which is what Parrot uses — is **not** affected. If Plex extends restrictions to the library API in the future, Parrot would degrade gracefully (same "not owned" fallback as today when reachability fails). That's the trade-off of relying on remote access without paying Pass.

## Troubleshooting

- **Auto-detect returns empty** — Plex Remote Access probably isn't enabled on your server. Open Plex → Settings → Remote Access and turn it on. Wait a few minutes for Plex's relay to publish the URL, then click Auto-detect again
- **Remote URL works at home but not away** — Some routers don't support hairpin NAT, so the public URL doesn't resolve when you're on the same LAN. That's fine — Parrot tries the local URL first when at home, falls back to the remote URL when away. The session memo handles the switch automatically
- **Badge slow on first call when away** — The local URL has to time out (30 seconds) before the remote URL is tried. After the first successful call, the memo locks the working URL for the rest of the session
