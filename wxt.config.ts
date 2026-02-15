import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  entrypointsDir: "entrypoints",
  manifest: {
    name: "Parrot",
    description:
      "See if media you're browsing is already in your Plex library",
    version: "1.0.0",
    permissions: ["storage"],
    host_permissions: ["http://*/library/*", "https://*/library/*"],
  },
});
