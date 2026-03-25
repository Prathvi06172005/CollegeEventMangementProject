# College Event Zone

## Project Description

College Event Zone is a role-based event management system designed to manage college events efficiently. It provides separate features for organizers and students, including event creation, registration, notifications, and feedback.

## Features

### Organizer

* Add, edit, and delete events
* Mark events as completed
* View student feedback
* Automatically notify students

### Student

* Browse available events
* Register using Google Form links
* Mark registration status
* Submit feedback after event completion
* View notifications and reminders

## Technologies Used

* HTML
* CSS
* JavaScript
* Node.js
* Express.js
* SQLite

## Quick Start

1. Install Node.js (LTS version)
2. Install dependencies:
   npm install
3. Start development server:
   npm run dev
4. Open in browser:
   http://localhost:3000

## Android Application

* Android wrapper is available in `android-app/`
* Open `android-app/android-app` in Android Studio
* The app uses WebView to load the web application

### Configuration

* Debug URL: http://10.0.2.2:3000
* Update `WEB_APP_URL` in `app/build.gradle` for production

## Default Users

Organizer
Username: organizer
Password: organizer123

Students
Username: student1 / student2 / student3
Password: student123

## Project Data

* Database: `src/data/app.sqlite`
* Sessions: `src/data/sessions.sqlite`

## Reminders

* Daily reminder at 9:00 AM
* Event-day reminder at 8:00 AM

## Notes

* `node_modules` is not included; run `npm install`
* Set `SESSION_SECRET` environment variable to override default value
* Android build files are minimized due to size limitations

## Purpose

This project is developed to demonstrate full-stack web development and event management system functionality.
