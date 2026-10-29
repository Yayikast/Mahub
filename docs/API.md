# Mahub API contract

This file is the agreement between the **screens** (Boeing) and the **server** (Pinya and Yayika). It says what each route accepts and what it sends back.

- The screens build against fake data in these exact shapes.
- The server builds real routes that return these exact shapes.
- If this file and the code disagree, **this file is right**. Change the code, or change this file first and tell the others.

> **Status:** draft. Everyone reads it together and says "agreed" before building. Fix anything that doesn't work for you now, not later.

---

## How to read an entry

```
GET /api/my/sections            ← the method and the address
  Who:     instructor           ← who is allowed to call it
  Sends:   nothing              ← what the screen puts in the request
  Returns: 200 [ ... ]          ← what comes back when it works
  Errors:  401, 403             ← what comes back when it doesn't
```

**Methods:** `GET` reads, `POST` creates, `PUT` edits, `DELETE` removes.

---

## Rules that apply everywhere

1. **Data is JSON.** Field names are `snake_case`, the same as the database columns (`course_code`, not `courseCode`).
2. **Ids are numbers.** Times are text in UTC, like `"2026-11-02T09:00:00Z"`. The screen turns them into local time.
3. **Who you are comes from the login cookie.** The screen never sends its own user id. The browser sends the cookie automatically.
4. **Addresses start with `/api`**, except sign-in (`/auth/...`) and scanning (`/scan`).
5. **Every error looks like this:** `{ "error": "A short message" }`. Check-in failures also add `"reason"` (see below).
6. **Nothing from the database ever appears in an error.** A crash is always `500 { "error": "Something went wrong" }`.

### Status codes

| Code | Meaning | When |
|---|---|---|
| 200 | OK | A read or an edit worked |
| 201 | Created | A new row was added |
| 400 | Bad input | A field is missing or wrong |
| 401 | Not signed in | No valid login cookie |
| 403 | Not allowed | Wrong role, or not your section |
| 404 | Not found | That id doesn't exist |
| 409 | Conflict | A duplicate, or the thing is already open or closed |
| 422 | Check-in refused | A check-in rule failed (see `reason`) |
| 500 | Server problem | Something unexpected |

### Short forms used below

- **Signed in** means any role. **Admin / Instructor / Student** means only that role.
- **Own section** means an instructor can only use sections where they are the teacher, otherwise they get 403.
- `OK` means the reply is `{ "ok": true }`.
- Every route that isn't listed as public needs sign-in, so every one of them can also return **401**. This isn't repeated in each entry.

---

## 1. Sign-in

### `GET /auth/google`
Sends the browser to Google. Not JSON.
- **Who:** anyone
- **Returns:** a redirect to Google

### `GET /auth/google/callback`
Google sends the browser back here. The server checks the user, then redirects.
- **Who:** anyone
- **Returns:** a redirect to the user's home page (`/admin`, `/instructor` or `/me`), or to `/not-registered` if the account isn't registered

### `POST /auth/logout`
- **Who:** signed in
- **Sends:** nothing
- **Returns:** `200 OK`

### `GET /api/me`
Who am I? The screens call this when they load.
- **Who:** signed in
- **Sends:** nothing
- **Returns:**
```json
200 { "id": 7, "full_name": "Somchai P.", "email": "somchai@g.siit.tu.ac.th", "role": "student" }
```
- **Errors:** 401 (the screen then shows the sign-in page)

### `POST /auth/dev-login`  *(for building only)*
Sign in as a fake user without Google. It only exists when `DEV_LOGIN=1`, which is set on a laptop and **never on Vercel**.
- **Who:** anyone, when the flag is on
- **Sends:** `{ "user_id": 7 }`
- **Returns:** `200` with the same shape as `/api/me`
- **Errors:** 404 when the flag is off, 400 if the user id is missing

### `GET /auth/dev-users`  *(for building only)*
The users the dev login screen shows as buttons, so you can switch roles with one click. Same rule: it only exists when `DEV_LOGIN=1`.
- **Who:** anyone, when the flag is on
- **Sends:** nothing
- **Returns:**
```json
200 [ { "id": 1, "full_name": "Ada Admin", "email": "admin@example.com", "role": "admin" } ]
```
- **Errors:** 404 when the flag is off

---

## 2. Admin

All admin routes: **Who: Admin.** Anyone else gets 403.

### Users

#### `GET /api/users`
- **Returns:**
```json
200 [ { "id": 7, "email": "somchai@g.siit.tu.ac.th", "full_name": "Somchai P.", "role": "student", "student_no": "6722771886" } ]
```
(`student_no` is `null` for admins and instructors.)

#### `POST /api/users`
- **Sends:** `{ "email": "...", "full_name": "...", "role": "student", "student_no": "6722771886" }` (`student_no` is only for students)
- **Returns:** `201` the new user, in the same shape as above
- **Errors:** 400 missing or wrong field (for example a role that isn't admin, instructor or student), 409 email already exists

#### `PUT /api/users/:id`
- **Sends:** any of `email`, `full_name`, `role`, `student_no`
- **Returns:** `200` the updated user
- **Errors:** 400, 404, 409 email already exists

#### `DELETE /api/users/:id`
- **Returns:** `200 OK`
- **Errors:** 404, 409 the user is still used by a section or attendance record

### Courses

#### `GET /api/courses`
- **Returns:** `200 [ { "id": 1, "code": "CSS326", "name": "Database Programming Laboratory" } ]`

#### `POST /api/courses`
- **Sends:** `{ "code": "CSS326", "name": "Database Programming Laboratory" }`
- **Returns:** `201` the new course
- **Errors:** 400, 409 the code already exists

#### `PUT /api/courses/:id`
- **Sends:** any of `code`, `name`
- **Returns:** `200` the updated course
- **Errors:** 400, 404, 409

#### `DELETE /api/courses/:id`
- **Returns:** `200 OK`
- **Errors:** 404, 409 the course still has sections

### Sections

A section is a course taught by one instructor in one term.

#### `GET /api/sections`
- **Returns:**
```json
200 [ { "id": 3, "course_id": 1, "course_code": "CSS326", "course_name": "Database Programming Laboratory",
        "instructor_id": 2, "instructor_name": "Dr. Nok", "term": "2026-1", "section_no": 1 } ]
```

#### `POST /api/sections`
- **Sends:** `{ "course_id": 1, "instructor_id": 2, "term": "2026-1", "section_no": 1 }`
- **Returns:** `201` the new section, in the same shape as above
- **Errors:** 400 (also if `instructor_id` isn't an instructor), 409 that course, term and section number already exist

#### `PUT /api/sections/:id`
- **Sends:** any of `course_id`, `instructor_id`, `term`, `section_no`
- **Returns:** `200` the updated section
- **Errors:** 400, 404, 409

#### `DELETE /api/sections/:id`
- **Returns:** `200 OK`
- **Errors:** 404, 409 the section still has sessions

### Enrollments

#### `GET /api/sections/:id/enrollments`
- **Returns:**
```json
200 [ { "student_id": 7, "full_name": "Somchai P.", "email": "somchai@g.siit.tu.ac.th", "student_no": "6722771886" } ]
```
- **Errors:** 404

#### `POST /api/sections/:id/enrollments`
- **Sends:** `{ "student_id": 7 }`
- **Returns:** `201` the student, in the same shape as above
- **Errors:** 400 (the user isn't a student), 404, 409 already enrolled

#### `DELETE /api/sections/:id/enrollments/:studentId`
- **Returns:** `200 OK`
- **Errors:** 404

### Rooms

Every check-in session happens in a room, and the check-in compares the phone's location with the room's.

#### `GET /api/rooms`
- **Who:** Admin **and Instructor** (the instructor picks a room when starting a check-in). Adding, editing and deleting rooms stays admin only.
- **Returns:** `200 [ { "id": 1, "name": "SIIT 301", "lat": 14.0686, "lng": 100.6128, "radius_m": 25 } ]`

#### `POST /api/rooms`, `PUT /api/rooms/:id`, `DELETE /api/rooms/:id`
- **Sends (POST):** `{ "name": "...", "lat": 14.0686, "lng": 100.6128, "radius_m": 25 }` (PUT takes any of them)
- **Returns:** `201` or `200` the room, or `200 OK` for a delete
- **Errors:** 400, 404, 409 (a delete fails if a session uses the room)

### Audit log

#### `GET /api/audit`
Every change to attendance, newest first. Read only.
- **Sends (optional):** `?limit=50`
- **Returns:**
```json
200 [ { "id": 41, "action": "INSERT", "session_id": 12, "student_id": 7,
        "old_status": null, "new_status": "present", "changed_by": 7, "changed_at": "2026-11-02T09:03:11Z" } ]
```
`action` is `INSERT`, `UPDATE` or `DELETE`. `old_status` or `new_status` is `null` when there was no row before or after.

---

## 3. Instructor

All instructor routes: **Who: Instructor, own section only.** Wrong role or someone else's section gets 403.

#### `GET /api/my/sections`
- **Returns:**
```json
200 [ { "id": 3, "course_code": "CSS326", "course_name": "Database Programming Laboratory", "term": "2026-1", "section_no": 1 } ]
```

#### `GET /api/sections/:id/sessions`
Past and current check-ins for a section, newest first.
- **Returns:**
```json
200 [ { "id": 12, "opened_at": "2026-11-02T09:00:00Z", "closed_at": null,
        "present_count": 18, "excused_count": 1, "enrolled_count": 30 } ]
```
`closed_at` is `null` while the session is open.
- **Errors:** 403, 404

#### `POST /api/sections/:id/sessions`
Start a check-in in a room. The screen gets the rooms from `GET /api/rooms`.
- **Sends:** `{ "room_id": 1 }` (required)
- **Returns:** `201 { "id": 12, "section_id": 3, "room_id": 1, "opened_at": "2026-11-02T09:00:00Z" }`
- **Errors:** 400 `room_id` missing or not a room, 403, 404, 409 a session is already open for this section

#### `POST /api/sessions/:id/close`
End the session. Anyone without a check-in is absent.
- **Sends:** nothing
- **Returns:** `200 { "id": 12, "closed_at": "2026-11-02T10:30:00Z" }`
- **Errors:** 403, 404, 409 already closed

#### `GET /api/sessions/:id/qr`
The current QR link. If the old code has expired, the server makes a new one. The screen calls this every 10 seconds and draws a QR code from `scan_url`.
- **Returns:**
```json
200 { "scan_url": "https://mahub.example.com/scan?s=12&c=ab39f2", "expires_at": "2026-11-02T09:00:10Z" }
```
- **Errors:** 403, 404, 409 the session is closed

#### `GET /api/sessions/:id/roster`
Every enrolled student with their status, plus the counts. The screen calls this every 3 seconds. After the session is closed, the same data is the summary.
- **Returns:**
```json
200 { "session_id": 12, "is_open": true,
      "counts": { "present": 18, "excused": 1, "absent": 11, "total": 30 },
      "students": [ { "student_id": 7, "full_name": "Somchai P.", "student_no": "6722771886",
                      "status": "present", "method": "qr", "recorded_at": "2026-11-02T09:03:11Z" } ] }
```
`status` is `present`, `excused` or `absent`. For an absent student, `method` and `recorded_at` are `null`.
- **Errors:** 403, 404

#### `PUT /api/sessions/:id/attendance/:studentId`
Mark a student by hand (dead phone, approved absence).
- **Sends:** `{ "status": "present" }` or `{ "status": "excused" }`
- **Returns:** `200 { "student_id": 7, "status": "present", "method": "manual" }`
- **Errors:** 400 bad status, 403, 404 (the session, or the student isn't enrolled in it)

#### `DELETE /api/sessions/:id/attendance/:studentId`
Clear a mark. The student goes back to absent.
- **Returns:** `200 OK`
- **Errors:** 403, 404 (there was no mark)

#### `GET /api/sessions/:id/attempts`
Every check-in attempt, including failures, newest first.
- **Returns:**
```json
200 [ { "id": 88, "user_id": 7, "full_name": "Somchai P.", "outcome": "too_far",
        "distance_m": 140, "accuracy_m": 18, "created_at": "2026-11-02T09:02:40Z" } ]
```
`outcome` is one of: `ok`, `expired`, `not_enrolled`, `closed`, `duplicate`, `too_far`, `low_accuracy`. `distance_m` is `null` when the check stopped before the distance was worked out (for example `closed`).

Attempts are recorded by `POST /api/checkin` only. A failed scan at `/scan` isn't recorded, because the student usually isn't signed in yet, so we don't know who it was.
- **Errors:** 403, 404

---

## 4. Student

### `GET /scan?s=12&c=ab39f2`
What the QR code opens. Not JSON.
- **Who:** anyone
- **What the server does:** checks the code is the current one. If it is, it remembers the scan in a short-lived cookie.
- **Returns:** a redirect to Google sign-in if the user isn't signed in, or to `/checkin` if they are. If the code is wrong or expired, a redirect to `/scan-failed?reason=expired`.

### `POST /api/checkin`
Check in. The server uses the remembered scan and the login cookie. The screen sends only the location.
- **Who:** Student
- **Sends:** `{ "lat": 14.07, "lng": 100.61, "accuracy": 18 }` (`accuracy` is in metres)
- **Returns:** `200 { "status": "checked_in", "session_id": 12 }`
- **Errors:**

| Code | `reason` | Meaning | Suggested message on the screen |
|---|---|---|---|
| 400 | | Missing or invalid `lat`, `lng` or `accuracy` | "Couldn't read your location" |
| 403 | `not_enrolled` | Not in this section | "You're not enrolled in this class" |
| 409 | `already_checked_in` | Already has a row for this session | "You're already checked in" |
| 422 | `expired` | The scan is too old or the code is out of date | "QR expired, scan again" |
| 422 | `no_scan` | No remembered scan | "Scan the QR code first" |
| 422 | `closed` | The session has ended | "Check-in is closed" |
| 422 | `too_far` | Outside the room, even allowing for accuracy | "You seem too far from the room" |
| 422 | `low_accuracy` | The phone's location is too rough | "Turn on precise location for Chrome" |

Example error: `422 { "error": "QR expired", "reason": "expired" }`

### `GET /api/my/attendance`
My rate in each class.
- **Who:** Student
- **Returns:**
```json
200 [ { "section_id": 3, "course_code": "CSS326", "course_name": "Database Programming Laboratory",
        "section_no": 1, "attended": 9, "total_sessions": 10, "rate": 90 } ]
```
`attended` counts present and excused. `rate` is a whole-number percentage of closed sessions.

### `GET /api/my/classes/:id`
My sessions in one class (`:id` is the section id). Students' routes say "classes" so they aren't mixed up with the instructor's `/api/my/sections`.
- **Who:** Student, only for a section they're enrolled in
- **Returns:**
```json
200 { "section": { "id": 3, "course_code": "CSS326", "course_name": "Database Programming Laboratory", "section_no": 1 },
      "sessions": [ { "session_id": 12, "opened_at": "2026-11-02T09:00:00Z", "status": "present" } ] }
```
`status` is `present`, `excused` or `absent`.
- **Errors:** 403 (not enrolled), 404

---

## 5. Screens and the routes they use

A quick check that every screen has what it needs.

| Screen | Routes |
|---|---|
| Sign-in `/` | `/auth/google`; while building, `GET /auth/dev-users` and `POST /auth/dev-login` |
| Not registered `/not-registered` | none |
| Scan failed `/scan-failed?reason=expired` | none ("QR expired, scan again") |
| Every page (top bar) | `GET /api/me`, `POST /auth/logout` |
| Admin `/admin` | users, courses, sections, enrollments, rooms, audit |
| My sections `/instructor` | `GET /api/my/sections` |
| Section `/instructor/sections/:id` | `GET` and `POST /api/sections/:id/sessions`, `GET /api/rooms` (to pick the room) |
| Live session `/session/:id` | `qr`, `roster`, `attendance` (PUT, DELETE), `close` |
| Projector `/projector/:id` | `qr`, `roster` |
| Summary `/summary/:id` | `roster` |
| Check-in `/checkin` | `POST /api/checkin` |
| My classes `/me` | `GET /api/my/attendance` |
| My class `/me/classes/:id` | `GET /api/my/classes/:id` |

---

## 6. How we change this file

1. **Never change a route's shape without telling the others.** A rename can break a screen without any error.
2. To change something: edit this file first, tell the other two, then change the code.
3. If you find a mismatch while building, don't quietly work around it. Say so, and fix this file.

## 7. Agreed

Everyone reads the file together, fixes anything wrong, then writes their name.

- [ ] Boeing (screens)
- [ ] Pinya (database, admin and instructor routes)
- [ ] Yayika (sign-in, check-in and security)
