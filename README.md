# Mahub

**Take attendance in a university class in under 30 seconds, in a way that's hard to fake.**

The instructor projects a QR code that changes every 5 seconds. Students scan it with their phone, sign in with their SIIT Google account, and share their location. A moment later they're checked in, and the instructor watches the roster fill up.

Mahub is our team project for **CSS326 Database Programming Laboratory** (SIIT). It is a smaller rebuild of the earlier [Mahub](https://github.com/boeingxd/Mahub).

> **Status:** finished. Every feature is built, tested on real phones, and was demonstrated in class on 5 November 2026.

**Live site:** [mahub.live](https://mahub.live). It runs the real server against Supabase, with Google sign-in. Only accounts an admin has registered (and, while the Google app is in testing, its listed test users) can sign in.

---

## The problem

Calling names or passing round a sheet of paper takes minutes, and it's easy to cheat: a friend signs for you, or a photo of the QR code is sent to someone who isn't in the room. Mahub makes cheating hard and takes only seconds.

## How a class works

**Instructor** (laptop, mirrored to the projector)

1. Sign in and open **My sections**.
2. Open a section, pick the campus and click **Start check-in**.
3. Project the QR code. It changes every 5 seconds, and each code is accepted for only about 10 seconds, so a photo of it stops working almost at once.
4. Watch the count and roster fill in (the page refreshes every 3 seconds).
5. Fix anyone by hand: **Present** (dead phone), **Excused** (approved absence), or **Clear** (a wrong mark).
6. Click **End session**. Anyone who didn't check in counts as **absent**, and a summary shows who was there.

**Student** (phone)

1. Scan the QR code with the camera.
2. Sign in with your SIIT Google account (first time only).
3. Tap **Share my location**.
4. See **Checked in**, or a clear reason it failed.

Students can also open Mahub any time to see their own attendance rate in each class.

**Admin**

Registers users by email (one at a time or from a CSV file) and manages courses, sections, enrollments and campuses. Reads the audit log.

## Why it's hard to cheat

The **server and database** decide everything. The phone only sends what it has; it can't say "mark me present". A check-in is accepted only if **all** of these are true:

| Check | What it stops |
|---|---|
| The QR code is the current one, or was replaced less than 5 seconds ago (a real scan takes 1 to 3 seconds) | Sending a photo of the code to a friend who isn't there |
| Signed in with Google and registered by an admin (students need an SIIT account) | Anonymous check-ins or made-up names |
| The check-in is open | Checking in after class |
| Enrolled in this section | A student from another class checking in |
| Only one check-in per student per session | Counting someone twice |
| The phone is on campus (Rangsit or Bangkadi), allowing for the GPS accuracy it reports | Checking in from home |

Every check-in attempt, including failed ones, is logged. Only the distance to the campus and the GPS accuracy are stored, never the exact location.

**What it can't stop:** a student who gives a friend their Google password while that friend is on campus. The location is also reported by the phone, so a determined spoofer isn't stopped.

## Roles

| Role | Can do | Can't do |
|---|---|---|
| **Admin** | Add, edit and delete users, courses, sections, campuses and enrollments; read the audit log | Check in |
| **Instructor** | Open and close check-in for **their own** sections; mark a student present or excused, or clear a mark; see who is enrolled in their own sections and enrol existing students from a CSV file | Touch other instructors' sections; create users; remove students from a section |
| **Student** | Check in; see **their own** attendance | Edit anything; see other students |

Roles are checked on the server for every request, not just hidden in the screens.

## Tech

| Part | Choice |
|---|---|
| Database | PostgreSQL, hosted on **Supabase** |
| Server | Node.js + **Express**, `pg` with parameterized queries only |
| Screens | **React** (Vite) |
| Sign-in | Google sign-in; login kept in a signed `cookie-session` cookie |
| Live roster | The page asks the server every 3 seconds |
| Hosting | **Vercel** serves the built React files and runs Express as a function, at one address, in Singapore (`sin1`) next to the database |

```
 Browser ──https──▶ Vercel ─┬─▶ React screens (static files)
                            └─▶ Express API ──▶ Supabase (PostgreSQL)
```

Because Vercel can restart the server between requests, nothing is kept in server memory: logins live in a signed cookie, and the QR code and its expiry live in the database.

## Data model

Nine tables:

| Table | Purpose |
|---|---|
| `users` | Everyone who can sign in, with a `role` |
| `courses` | Course code and name |
| `sections` | A course taught by an instructor in a term |
| `enrollments` | Which students are in which section |
| `class_sessions` | One class meeting, with its current QR code and expiry |
| `attendance` | One row per checked-in student. **Absent means no row.** |
| `checkin_attempts` | Every check-in attempt with its outcome, distance and accuracy |
| `audit_log` | Every attendance change, written only by the trigger |
| `campuses` | Campus name (Rangsit, Bangkadi), centre point and allowed radius |

**Stored procedure** `check_in`: runs all the check-in rules in one transaction (session open, enrolled, location precise enough, within the campus radius) and inserts the attendance row. The distance comes from the `haversine_m` function.
**Trigger** `attendance_audit`: records who changed an attendance row, and when.
**Also:** the `attendance_rate` function, two views for the roster (`v_session_roster`) and each student's rate (`v_student_attendance`), and three indexes measured with `EXPLAIN` before and after (see [docs/PERFORMANCE.md](docs/PERFORMANCE.md)).

The full diagram is in [docs/ERD.png](docs/ERD.png).

## Security

- All queries are **parameterized** (`$1`, `$2`, ...); no SQL is built by joining strings.
- Secrets (database password, Google client ID and secret, cookie secret) live in `.env` locally and in Vercel's environment variables when deployed. They are never committed.
- The app signs in to the database as a **least-privilege user** (`mahub_app`, see `db/roles.sql`), not `postgres`. It can only read the audit log; the trigger and two `SECURITY DEFINER` functions (`log_import`, `log_enrollment`) are the only things that write to it.
- Supabase's automatic table API is **turned off**, so the database is reachable only through Express.
- Errors shown to users are **generic**; details go only to the server log.
- Role and ownership checks run in server middleware on every route.

## Run it locally

Requirements: a Supabase account, a Vercel account, Node.js 22.

```bash
# 1. Database: in the Supabase SQL editor run, in this order
#    db/schema.sql, db/functions.sql, db/roles.sql, db/seed.sql
#    then give the app's login a password, once, by hand (never in a file):
#      ALTER ROLE mahub_app WITH PASSWORD '...';
#    The server's DATABASE_URL logs in as mahub_app.<project-ref> (see server/.env.example)

# 2. Server
cd server
cp .env.example .env      # fill in the values
npm install
npm run dev               # http://localhost:3000
                          # DEV_LOGIN=1 in .env adds a dev login (POST /auth/dev-login) for testing; it is local only

# 3. Screens
cd client
npm install
npm run dev               # http://localhost:5173
```

## Deploy

This is how [mahub.live](https://mahub.live) is set up.

1. Put the code on GitHub, with `.env` in `.gitignore`.
2. In Vercel, import the repo. `vercel.json` builds `client/`, runs Express from `api/index.js`, and pins the function to Singapore (`sin1`), where the Supabase database is.
3. Add the environment variables in Vercel's dashboard, including `PUBLIC_URL=https://mahub.live`. Do **not** set `DEV_LOGIN`.
4. Add the Vercel address to the Google sign-in redirect addresses.
5. Every push to `main` redeploys.

## Team

| Person | Owns |
|---|---|
| **Boeing** | All the screens; the Vercel deployment |
| **Pinya** | The database design, seed data, trigger and views; the admin and instructor routes |
| **Yayika** | Google sign-in, role checks, student check-in and the `check_in` procedure; security and the Supabase setup |

## Where to read next

| If you want to… | Read |
|---|---|
| See exactly what each route sends and returns | [docs/API.md](docs/API.md) |
| See the tables and how they connect | [docs/ERD.png](docs/ERD.png) |
| See the indexes and the `EXPLAIN` plans | [docs/PERFORMANCE.md](docs/PERFORMANCE.md) |
| Try every route by hand | [server/requests.http](server/requests.http) |
| See who did what | The [GitHub issues](../../issues) and pull requests |
