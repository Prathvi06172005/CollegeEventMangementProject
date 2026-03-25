# Android wrapper

This module contains a lightweight native Android shell that wraps the College Event Zone web experience inside a hardened `WebView`. It gives organizers and students an installable APK without rebuilding the UI.

## Project layout

```
android-app/
├─ android-app/          # Gradle project root
│  ├─ app/               # Android application module
│  ├─ build.gradle       # Top-level build config
│  ├─ gradle/            # Wrapper configuration (install Gradle 8.7)
│  └─ settings.gradle
└─ README.md             # You are here
```

## Requirements

- Android Studio Hedgehog/Koala or newer
- JDK 17+
- Android SDK Platform 34

## Running the development stack

1. Start the Node server so the web app is reachable from emulators:
   ```bash
   npm install
   npm run dev   # serves on http://localhost:3000
   ```
2. In Android Studio, open `android-app/android-app`.
3. When prompted, let Android Studio download the Gradle wrapper dependencies (if it asks for `gradle-wrapper.jar`, run **Gradle Wrapper** from Android Studio or execute `gradle wrapper` once in the project root).
4. Select the `app` configuration and click **Run**.  
   The debug build is pre-configured to load `http://10.0.2.2:3000`, which maps to your host machine from an Android emulator.

## Building a release APK/AAB

1. Update the production URL that the release build should open (`WEB_APP_URL` in `app/build.gradle`).
2. Configure signing in `app/signing-configs.gradle` or via Android Studio (**Build > Generate Signed Bundle / APK**).
3. Run:
   ```bash
   cd android-app/android-app
   ./gradlew assembleRelease
   ```
   The artifact will be in `app/build/outputs/apk/release/`.

## Customising the shell

- `MainActivity.kt` holds the `WebView` logic: tweak caching, add push permission hooks, or inject a JavaScript interface there.
- `network_security_config.xml` currently permits HTTP access to `10.0.2.2`/`localhost` for development. Remove that allowance before publishing if your production host is HTTPS.
- UI theming (status/navigation bars, splash colours, icons) can be updated under `app/src/main/res/`.

## Troubleshooting

- **Blank screen**: ensure the backend is reachable at the URL defined in `WEB_APP_URL`.
- **Cleartext blocked**: production builds default to HTTPS. If you really need HTTP, extend `network_security_config.xml`, but Play Store strongly recommends TLS.
- **Manifest merger failures**: Android Studio sometimes adds extra dependencies; re-sync Gradle and ensure `compileSdk` stays aligned with your SDK tools.

Happy shipping! 🎉

