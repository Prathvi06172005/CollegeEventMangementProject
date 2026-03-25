# Android App (WebView Wrapper)

This module contains a lightweight native Android application that wraps the College Event Zone web application inside a WebView. It allows users to access the system as a mobile app without rebuilding the UI.

## Project Layout

```
android-app/
├─ android-app/
│  ├─ app/
│  ├─ build.gradle
│  ├─ gradle/
│  └─ settings.gradle
└─ README.md
```

## Requirements

* Android Studio (latest version)
* JDK 17 or above
* Android SDK Platform 34

## Running the Application

1. Start the Node.js server:
   npm install
   npm run dev

2. Open Android Studio

3. Open project folder:
   android-app/android-app

4. Allow Gradle to download required dependencies

5. Select the "app" configuration and click Run

The app will load:
http://10.0.2.2:3000

## Building APK

1. Open terminal inside:
   android-app/android-app

2. Run:
   ./gradlew assembleRelease

3. APK will be generated in:
   app/build/outputs/apk/release/

## Configuration

* Default URL:
  http://10.0.2.2:3000

* To change production URL:
  Edit WEB_APP_URL in:
  app/build.gradle

## Customization

* MainActivity.kt: WebView logic
* app/src/main/res/: UI design, icons, colors

## Troubleshooting

* Blank screen: Ensure backend is running
* Network error: Check correct URL is set
* Build errors: Sync Gradle and rebuild project
