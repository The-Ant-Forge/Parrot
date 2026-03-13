import { defineConfig } from "wxt";
import pkg from "./package.json";

export default defineConfig({
  srcDir: "src",
  entrypointsDir: "entrypoints",
  manifest: {
    name: "Parrot",
    description:
      "See if media you're browsing is already in your Plex library",
    version: pkg.version,
    permissions: ["storage", "unlimitedStorage"],
    host_permissions: [
      "http://*/library/*",
      "https://*/library/*",
      "https://api.themoviedb.org/*",
      "https://api4.thetvdb.com/*",
      "https://api.tvmaze.com/*",
      "https://api.github.com/*",
      "https://www.omdbapi.com/*",
      "https://api.radarr.video/*",
      "https://skyhook.sonarr.tv/*",
    ],
    action: {
      default_icon: {
        "16": "icons/inactive-16.png",
        "32": "icons/inactive-32.png",
        "48": "icons/inactive-48.png",
        "128": "icons/inactive-128.png",
      },
    },
    icons: {
      "16": "icons/inactive-16.png",
      "32": "icons/inactive-32.png",
      "48": "icons/inactive-48.png",
      "128": "icons/inactive-128.png",
    },
  },
});
