# Packaging the Android APK

## What the APK contains

A Trusted Web Activity (TWA): a thin native launcher that opens `https://<your-domain>/app` in standalone mode using the device's Chrome engine. There is no backend, database, or business logic in the APK. The Next.js server on Render and Supabase keep serving everything over HTTPS, exactly as they do for the browser PWA.

Because the app already ships a valid `manifest.webmanifest`, service worker, icons and offline report queue, **no application code changes are needed**. The only site-side file to add is Digital Asset Links, created from the APK signing key.

## Build with PWABuilder (no local Android SDK)

1. **Deploy the web app** using `render.yaml`. Set `APP_URL` to the final HTTPS URL, then verify both URLs return 200:

   ```
   https://<your-domain>/manifest.webmanifest
   https://<your-domain>/sw.js
   ```

2. Open <https://www.pwabuilder.com>, paste the deployed origin (e.g. `https://navopulse.onrender.com`), and click **Package for stores** (top right). It reads the manifest and reports the PWA checks. The service worker covers `/app`, so the installability check passes.

3. In the **Android** card click **Generate Package**, then select the **Google Play** tab. (The **Other Android** tab hides the signing controls and always produces an unsigned package — its ZIP has only `*-unsigned.apk`, `*-unsigned.aab` and `Readme.html`, and the APK cannot be installed.) You do **not** need a Play Store account to use this tab; you just won't upload the `.aab`.

4. In the Android options form, scroll to the bottom. **Signing key** sits after *Google Play billing*, with radio options **New**, **Use mine**, **None**. Select **New**, leave **Display mode = Standalone**, then click **Download Package**.

5. Unzip the download. Typical contents:

   | File in the ZIP | What to do with it |
   |---|---|
   | `assetlinks.json` (Play tab) | Copy to `apps/web/public/.well-known/assetlinks.json` (create the folder). It already has the correct package ID and SHA-256 fingerprint. Commit it and redeploy. Next.js serves `public/` verbatim, so it appears at `https://<your-domain>/.well-known/assetlinks.json`. |
   | `signing.keystore` | Back it up outside the repo — it is the app's identity. |
   | `signing-key-info.txt` | Back up with the keystore: holds key alias, key password and store password. |
   | `.apk` (or `.aab`) | The installable app. Rename the APK to `navopulse.apk` if desired. |

   If the ZIP still contains only `*-unsigned.apk`, `*-unsigned.aab` and `Readme.html`, you were on the **Other Android** tab. Redo step 3 on the **Google Play** tab.

   Losing the keystore and its passwords means you cannot publish an update signed as the same app. Without a valid deployed `assetlinks.json` Chrome draws an address bar over the app, and Play Store rejects it.

   For reference, the copied file looks like this (values come from the ZIP, don't invent them):

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "<FROM_THE_ZIP>",
         "sha256_cert_fingerprints": ["<FROM_THE_ZIP>"]
       }
     }
   ]
   ```

6. If you later upload the `.aab`, Google Play re-signs it: get the new fingerprint from **Play Console → Setup → App integrity → App signing** and add it as a second entry in `sha256_cert_fingerprints`, then redeploy. Not needed for the sideload APK.

7. To offer a direct download from the project site, drop the file into `apps/web/public/downloads/navopulse.apk` and link to `/downloads/navopulse.apk`. Next.js serves it as a static file. Note that APK binaries should not be committed to git; host them on the web server or a release asset instead.

8. Install on Android by opening the APK. Android will ask to allow "Install unknown apps"; Play Protect may warn about a sideloaded app. Both are expected for a direct download.

## Alternative: Bubblewrap CLI

Reproducible local builds, requires Java JDK 17+ and an Android SDK (Bubblewrap downloads most of it on first run):

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://<your-domain>/manifest.webmanifest
bubblewrap build
```

The generated `twa-manifest.json` holds the package ID, signing key path and app version. Increment `appVersion` there for each release before rebuilding.

## Updates and limits

- Web fixes deploy to Render normally; the installed APK picks them up on next launch. Rebuild/reinstall the APK only when the URL, signing key or package metadata changes.
- Play Store updates must be signed with the same key, with a higher `appVersion`, and use the AAB.
- The APK needs a network connection for private data (reports, map, chat, dashboard). The service worker caches the app shell and public reference data for offline viewing; the report queue stores unsent reports and photos on the device and syncs on reconnect.
- A free Render instance spins down when idle, so the first launch after inactivity can take a few seconds.
- TWAs run on Chromium-based browsers. iOS does not use this APK; residents there use the PWA via **Add to Home Screen**.
