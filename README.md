# HabitArena

HabitArena is a habit competition app for small groups. People create a room with a shared checklist, join by room name and password, and mark their own daily progress.

## Features

- Email and password accounts with a display name and unique username.
- Private personal habits and daily check-ins.
- Password-protected multi-person rooms with a room-owned checklist.
- Side-by-side daily room progress and centered daily summaries.
- Weekly and monthly summaries for completed periods.
- Room owners and admins can edit the shared checklist; each member marks only their own progress.
- Supabase Row Level Security policies protect user and room data.

## Run locally

1. Install Node.js.
2. In the project folder, install dependencies:

   ```powershell
   npm.cmd install
   ```

3. Copy `.env.example` to `.env` and enter your Supabase project URL and **publishable** key.
4. In Supabase, apply the SQL migrations in `supabase/migrations` in filename order for a fresh project.
5. Start the app:

   ```powershell
   npm.cmd run dev
   ```

6. Open the `localhost` address printed in the terminal. Use the Vite address, not VS Code Live Server.

For an existing database that already has rooms and room memberships, use the room upgrade migration as instructed for that database; do not rerun the original room table setup over existing tables.

## Keep credentials private

`.env` and `.env.*` are excluded by `.gitignore`; `.env.example` is safe to share because it contains placeholders. Never put a Supabase service-role or secret key in browser code or commit it to GitHub. The browser publishable key is intended for public use and must be protected by the project's RLS policies.
