# Mac App Store package in GitHub Actions

The [App Store workflow](../.github/workflows/app-store.yml) builds a signed,
universal macOS `.pkg` and saves it as a GitHub Actions artifact for 30 days.
Pushes to `release` also upload the package to App Store Connect. From **Actions
→ App Store → Run workflow**, leave **Upload the package** unchecked to build
and inspect the package without uploading; check it to upload from a manual run.

Create the `app-store` GitHub environment and add these environment secrets:

| Secret | Value |
| --- | --- |
| `MAC_APP_CERT_P12` | Single-line Base64 of the Mac App Distribution `.p12`, including its private key |
| `MAC_APP_CERT_PASSWORD` | Password used when exporting that `.p12` |
| `MAC_INSTALLER_CERT_P12` | Single-line Base64 of the Mac Installer Distribution `.p12`, including its private key |
| `MAC_INSTALLER_CERT_PASSWORD` | Password used when exporting that `.p12` |
| `MAC_PROVISIONING_PROFILE` | Single-line Base64 of a **Mac App Store Connect** profile for `com.kaija.ai-analyzer`, team `H2ZM466J6A` |
| `ASC_KEY_ID` | App Store Connect **team** API key ID (only needed when uploading) |
| `ASC_ISSUER_ID` | Issuer ID from the App Store Connect API keys page (only needed when uploading) |
| `ASC_PRIVATE_KEY` | Full text of the matching `.p8` file, without Base64 (only needed when uploading) |

For a local file, make single-line Base64 with `base64 < file | tr -d '\n'`.
The workflow checks for missing secrets before installing dependencies, and the
build script checks the profile's expiration, app ID, and platform before
compiling. It will reject an iOS profile or one for another app.

Set the environment variable `BUILD_NUMBER_OFFSET` so that
`GITHUB_RUN_NUMBER + BUILD_NUMBER_OFFSET` exceeds the latest build number in
App Store Connect. The default offset is `5`; a run with number `1` would use
build number `6`. Increase the offset if a later build has already been uploaded.
The package filename and uploaded tag include this build number.

The workflow does not create a TestFlight group or assign testers. Wait for
Apple's processing to finish, then manage testers in App Store Connect.
