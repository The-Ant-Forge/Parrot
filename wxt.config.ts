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
    ],
  },
});
