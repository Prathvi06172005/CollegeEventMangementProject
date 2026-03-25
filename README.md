# College Event Zone

Role-based event app with Organizer and Student features, Google Form registration links, feedback after completion, and in-app notifications with reminders.

Quick Start:
- Install Node.js LTS
- Run: npm install
- Dev: npm run dev
- Open: http://localhost:3000

Android Wrapper:
- Code lives under `android-app/`
- Open `android-app/android-app` in Android Studio to build a WebView-based APK
- Debug build points to `http://10.0.2.2:3000`; adjust `WEB_APP_URL` in `app/build.gradle` for production

Default Users:
- Organizer: organizer / organizer123
- Students: student1, student2, student3 / student123

Features:
- Organizer: add/edit/delete events, mark completed, view feedback, auto-notify students
- Student: browse events, open Google Form link, mark registered, give feedback post-completion, view notifications

Notes:
- DB file: src/data/app.sqlite
- Sessions: src/data/sessions.sqlite
- Reminders: daily at 9 AM and event day at 8 AM
- Set SESSION_SECRET env to override default
