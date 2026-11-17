# Turk Youth Hub

Turk Youth Hub is a mobile-first social and collaboration platform for Turkic
youth. It combines social sharing, multilingual communication, live rooms,
cross-border project teams, and Pan-Turkic language research in one product.

## Production stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, deployed on Vercel
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL, and WebSockets, deployed on Render
- **Authentication:** JWT bearer tokens with bcrypt password hashing
- **Data and media:** PostgreSQL in production, local SQLite fallback for development,
  and backend-managed uploads

## Completed features

- [x] Registration, login, JWT authentication, and country onboarding
- [x] Responsive mobile and desktop interface with dark/light themes
- [x] 7-language UI: Azerbaijani, Turkish, Kazakh, Kyrgyz, Uzbek, Turkmen, and English
- [x] Social feed with posts, media uploads, likes, comments, and saved posts
- [x] Follow/unfollow, user search, suggestions, profiles, and follower lists
- [x] 24-hour interactive stories and story viewer
- [x] Real-time Rooms with WebSocket chat for six country rooms and a global room
- [x] Private messaging with multilingual translation
- [x] Multi-lingual Translation API with language detection and provider fallbacks
- [x] Pan-Turkic Dictionary with dialect comparison, etymology notes, and word submissions
- [x] Project Hub for creating projects, joining teams, and contacting project founders
- [x] Real-time and polling-based notifications

## Local development

### Backend

1. Copy `backend/.env.example` to `backend/.env`.
2. Keep `ENV=development` and leave `DATABASE_URL` empty to use `./turk_hub.db`,
   or provide a local PostgreSQL URL.
3. Install dependencies from `backend/requirements.txt`.
4. Start the API with Uvicorn from the `backend` directory.

Production requires both `DATABASE_URL` and `SECRET_KEY`; the application fails
fast if either is missing when `ENV=production`.

### Frontend

Set `VITE_API_URL` and `VITE_API_BASE_URL` to the backend URL in the appropriate
frontend environment file, then run the Vite development server or production
build from `frontend`.
