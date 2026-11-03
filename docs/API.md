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
200 [ { "id": 7, "email": "somchai@g.siit.tu.ac.th", "full_name": "Somchai P.", "role": "student", "student_no": "6722771886",
        "created_by": 1, "created_at": "2026-08-01T08:00:00Z" } ]
```
(`student_no` is `null` for admins and instructors. `created_by` is the id of the admin or instructor who added the user, and `null` for users with no known creator, such as seeded ones.)

#### `POST /api/users`
- **Sends:** `{ "email": "...", "full_name": "...", "role": "student", "student_no": "6722771886" }` (`student_no` is only for students)
- **Returns:** `201` the new user, in the same shape as above
- **Errors:** 400 missing or wrong field (for example a role that isn't admin, instructor or student, or a student whose email doesn't end in `@g.siit.tu.ac.th`), 409 email already exists

Student emails must end in `@g.siit.tu.ac.th` (capital letters don't matter), because students sign in with their SIIT Google account. Admins and instructors can use any email. A bad student email gets `400 { "error": "Student emails must end in @g.siit.tu.ac.th" }`.

#### `PUT /api/users/:id`
- **Sends:** any of `email`, `full_name`, `role`, `student_no`
- **Returns:** `200` the updated user
- **Errors:** 400 (including the SIIT email rule above, checked on the user as it will be after the edit: a student's new email, or an email that is not SIIT on a user whose role becomes `student`), 404, 409 email already exists

An admin cannot change their own role: sending a `role` other than their current one for their own id gets `400 { "error": "You can't change your own role" }`. Editing their own name or email is fine. The admin screen already locks the role on your own row, so this only guards a direct call.

#### `DELETE /api/users/:id`
- **Returns:** `200 OK`
- **Errors:** 400 `{ "error": "You can't delete your own account" }` when the id is the signed-in admin, 404, 409 the user is still used by a section or attendance record

#### `POST /api/users/import`
Add many users from a file. The screen reads the CSV and sends the rows. It works in two steps: a **dry run** for the preview screen, then the real run. Same shape as the enrollment import below.
- **Sends:**
```json
{ "dry_run": true,
  "rows": [ { "email": "somchai@g.siit.tu.ac.th", "full_name": "Somchai P.", "role": "student", "student_no": "6722771886" } ] }
```
At most 500 rows. `student_no` is only for students.
- **Returns:** `200` (see below)
```json
200 { "dry_run": true,
      "results": [ { "row": 1, "email": "somchai@g.siit.tu.ac.th", "result": "new_user" },
                   { "row": 2, "email": "ada@example.com", "result": "problem", "reason": "invalid_role" } ],
      "totals": { "new_user": 1, "already_exists": 0, "problem": 1 } }
```
- **`result` is one of:**
  - `new_user`: the account will be (or was) created.
  - `already_exists`: that email is already a user. Nothing is changed. The file's name, role and `student_no` are ignored and never overwrite.
  - `problem`: the row can't be used. `reason` says why: `invalid_email`, `not_siit_email` (a `student` row that would create an account, and the email doesn't end in `@g.siit.tu.ac.th`; admin and instructor rows can use any email), `name_required`, `invalid_role` (not admin, instructor or student), `student_no_mismatch` (that `student_no` belongs to a different user), `student_no_only_for_students`, `invalid_student_no` (a `student_no` that isn't 10 digits), `duplicate_row` (the same email or `student_no` appears earlier in the file).
- **Rules:**
  - `row` counts from 1, in the order the rows were sent.
  - `dry_run: true` saves nothing and always returns `200`, including any `problem` rows.
  - `dry_run: false` is **all or nothing**: if any row is a `problem`, nothing is saved and the reply is `400` with the same `results` and `totals`. Otherwise every new user is created in one transaction. The server checks every row again on the real run and does not trust the preview.
  - Running the same file twice is fine: those rows come back as `already_exists`.
  - A real run that saves something writes one `import` entry in the audit log. A dry run or a rejected run writes nothing.
- **Errors:** 400 (more than 500 rows, no rows, or any `problem` row on a real run; the `error` text says which), 403

### Courses

#### `GET /api/courses`
- **Returns:** `200 [ { "id": 1, "code": "CSS326", "name": "Database Programming Laboratory" } ]`

#### `POST /api/courses`
- **Sends:** `{ "code": "CSS326", "name": "Database Programming Laboratory" }`
- **Rules:** `code` and `name` are trimmed. `code` is stored in capitals (`" css326 "` is saved as `CSS326`), so `css326` and `CSS326` count as the same code. `code` is at most 20 characters and `name` at most 200. The reply shows the code as saved, so the screen should show what comes back, not what was typed.
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

The "All admin routes" rule above does not apply to `GET` and `import` here. Each entry says who may call it.

Only students who are **currently enrolled** count anywhere (rosters, session counts, attendance rates). Removing a student does not delete their check-in records, but they stop counting, so an old session's numbers can change after a removal. Enrolling the student again brings their history back.

#### `GET /api/sections/:id/enrollments`
- **Who:** Admin, or the Instructor of this section (own section only)
- **Returns:**
```json
200 [ { "student_id": 7, "full_name": "Somchai P.", "email": "somchai@g.siit.tu.ac.th", "student_no": "6722771886",
        "created_by": 1, "created_at": "2026-08-01T08:00:00Z" } ]
```
`created_by` is the id of whoever enrolled the student, or `null` if unknown. **`created_by` and `created_at` are only sent to the admin.** For an instructor they are left out.
- **Errors:** 403, 404

#### `POST /api/sections/:id/enrollments`
- **Who:** Admin
- **Sends:** `{ "student_id": 7 }`
- **Returns:** `201` the student, in the same shape as above
- **Errors:** 400 (the user isn't a student), 404, 409 already enrolled

#### `DELETE /api/sections/:id/enrollments/:studentId`
- **Who:** Admin. Instructors can't remove students, because removing changes past attendance numbers.
- **Returns:** `200 OK`
- **Errors:** 404

Both of these write an `enrollment` entry in the audit log.

#### `POST /api/sections/:id/enrollments/import`
Enrol many students from a CSV file. The screen reads the file and sends the rows. It works in two steps: a **dry run** for the preview screen, then the real run.
- **Who:** Admin, or the Instructor of this section (own section only)
- **Sends:**
```json
{ "dry_run": true,
  "rows": [ { "email": "somchai@g.siit.tu.ac.th", "full_name": "Somchai P.", "student_no": "6722771886" } ] }
```
At most 500 rows. `email` is required on every row. `full_name` is only needed when an account would be created (see `new_user`). Existing users keep their own name, so a file with only emails and student numbers works for them.
- **Returns:** `200`
```json
200 { "dry_run": true,
      "results": [ { "row": 1, "email": "somchai@g.siit.tu.ac.th", "result": "enroll" },
                   { "row": 2, "email": "new@g.siit.tu.ac.th", "result": "new_user" },
                   { "row": 3, "email": "mali@g.siit.tu.ac.th", "result": "already_enrolled" },
                   { "row": 4, "email": "oops@g.siit.tu.ac.th", "result": "problem", "reason": "not_a_user" } ],
      "totals": { "enroll": 1, "new_user": 1, "already_enrolled": 1, "problem": 1 } }
```
- **`result` is one of:**
  - `enroll`: an existing student who will be (or was) enrolled.
  - `new_user`: no such user yet. A student account will be (or was) created and enrolled. **Admin only.** When an instructor sends this row, it is a `problem` with `not_a_user` instead. Instructors never create users.
  - `already_enrolled`: already in this section. Nothing is changed.
  - `problem`: the row can't be used. `reason` says why:

| `reason` | Meaning |
|---|---|
| `invalid_email` | The email isn't a valid address |
| `not_siit_email` | An account would be created (admin only), but the email doesn't end in `@g.siit.tu.ac.th` |
| `not_a_user` | No user has this email, and the caller is an instructor |
| `not_a_student` | The email belongs to an admin or an instructor |
| `name_required` | An account would be created (admin only), but `full_name` is blank |
| `student_no_mismatch` | This `student_no` belongs to a different user than the row's email, even if the email matches an existing student |
| `invalid_student_no` | An account would be created (admin only), but `student_no` isn't 10 digits. Ignored for existing users |
| `duplicate_row` | The same email or `student_no` appears earlier in the file |

- **Rules:**
  - `row` counts from 1, in the order the rows were sent.
  - For an existing user, the file's name and `student_no` are never used to change the account.
  - `dry_run: true` saves nothing and always returns `200`, including any `problem` rows.
  - `dry_run: false` is **all or nothing**: if any row is a `problem`, nothing is saved (no accounts, no enrollments) and the reply is `400` with the same `results` and `totals`. Otherwise the new students are created and everyone is enrolled in one transaction. The server checks every row again on the real run and does not trust the preview.
  - Running the same file twice is fine: those rows come back as `already_enrolled`.
  - A real run that saves something writes one `import` entry in the audit log. A dry run or a rejected run writes nothing.
- **Errors:** 400 (more than 500 rows, no rows, or any `problem` row on a real run; the `error` text says which), 403, 404

### Campuses

Every check-in session happens on a campus (Rangsit or Bangkadi), and the check-in compares the phone's location with the campus's centre and radius.

#### `GET /api/campuses`
- **Who:** Admin **and Instructor** (the instructor picks a campus when starting a check-in). Adding, editing and deleting campuses stays admin only.
- **Returns:** `200 [ { "id": 1, "name": "Rangsit", "lat": 14.06930, "lng": 100.60778, "radius_m": 600 }, { "id": 2, "name": "Bangkadi", "lat": 13.98065, "lng": 100.55479, "radius_m": 300 } ]` (centre points are from Google Maps; both radii are starting guesses to verify on site)

#### `POST /api/campuses`, `PUT /api/campuses/:id`, `DELETE /api/campuses/:id`
- **Sends (POST):** `{ "name": "...", "lat": 14.0686, "lng": 100.6128, "radius_m": 600 }` (PUT takes any of them)
- **Rules:** `name` is trimmed and at most 100 characters. `lat` is a number from -90 to 90 and `lng` from -180 to 180. `radius_m` is a whole number from 10 to 5000. Anything else gets 400.
- **Returns:** `201` or `200` the campus, or `200 OK` for a delete
- **Errors:** 400, 404, 409 (a delete fails if a session uses the campus)

### Audit log

#### `GET /api/audit`
Every change to attendance, every enrollment change and every import, newest first. Read only.
- **Sends (optional):** `?limit=50` and `?type=attendance`, `enrollment` or `import` (leave out `type` for all of them)
- **Returns:** each row has a `type` that says which shape it has.
```json
200 [ { "id": 41, "type": "attendance", "action": "INSERT", "session_id": 12, "student_id": 7,
        "old_status": null, "new_status": "present", "changed_by": 7, "changed_at": "2026-11-02T09:03:11Z" },
      { "id": 52, "type": "enrollment", "action": "DELETE", "section_id": 3, "student_id": 7,
        "changed_by": 1, "changed_at": "2026-11-02T10:15:00Z" },
      { "id": 53, "type": "import", "action": "IMPORT", "section_id": 3,
        "summary": { "enroll": 28, "new_user": 0, "already_enrolled": 2 },
        "changed_by": 2, "changed_at": "2026-11-02T10:20:00Z" } ]
```
- **`attendance`:** `action` is `INSERT`, `UPDATE` or `DELETE`. `old_status` or `new_status` is `null` when there was no row before or after.
- **`enrollment`:** one row each time a student is added (`INSERT`) or removed (`DELETE`) with the single routes above.
- **`import`:** one row for each real import that saved something. `section_id` is `null` for `POST /api/users/import`, and its `summary` is `{ "new_user": 5, "already_exists": 2 }`. A saved import never contains problem rows, so there is no `problem` count.

Rows from before `type` existed are attendance rows. A screen that finds no `type` should treat the row as `attendance`.

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
`closed_at` is `null` while the session is open. The counts include only students who are **currently enrolled**, so `present_count + excused_count` is never more than `enrolled_count`.
- **Errors:** 403, 404

#### `POST /api/sections/:id/sessions`
Start a check-in on a campus. The screen gets the campuses from `GET /api/campuses`.
- **Sends:** `{ "campus_id": 1 }` (required)
- **Returns:** `201 { "id": 12, "section_id": 3, "campus_id": 1, "opened_at": "2026-11-02T09:00:00Z" }`
- **Errors:** 400 `campus_id` missing or not a campus, 403, 404, 409 a session is already open for this section

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
      "opened_at": "2026-11-02T09:00:00Z", "closed_at": null,
      "section": { "id": 3, "course_code": "CSS326", "course_name": "Database Programming Laboratory", "term": "2026-1", "section_no": 1 },
      "campus": { "id": 1, "name": "Rangsit" },
      "counts": { "present": 18, "excused": 1, "absent": 11, "total": 30 },
      "students": [ { "student_id": 7, "full_name": "Somchai P.", "student_no": "6722771886",
                      "status": "present", "method": "qr", "recorded_at": "2026-11-02T09:03:11Z" } ] }
```
`closed_at` is `null` while the session is open (the same as `is_open: true`). `status` is `present`, `excused` or `absent`. For an absent student, `method` and `recorded_at` are `null`. Only **currently enrolled** students are listed and counted, so `absent` is never below 0 and `present + excused + absent` always equals `total`.
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
        "distance_m": 950, "accuracy_m": 18, "created_at": "2026-11-02T09:02:40Z" } ]
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
- **Returns:**
```json
200 { "status": "checked_in", "session_id": 12, "section_id": 3, "course_code": "CSS326", "course_name": "Database Programming Laboratory",
      "section_no": 1, "campus": { "id": 1, "name": "Rangsit" } }
```
The class and campus are there so the success screen can say what you checked in to, and `section_id` lets it open that class's attendance. `campus` has the same shape as in the roster.
- **Location rule:** if `accuracy` is over 200 m, the answer is `low_accuracy`. Otherwise the check-in is accepted if the distance to the campus centre is at most `radius_m + accuracy`; if not, it's `too_far`.
- **Order:** if you already have a mark (in the session the scan cookie names, or in any open session), the answer is `409 already_checked_in` before `no_scan` or `expired` are checked. The scan cookie is gone after a check-in, so this is what a reload or a second scan gets.
- **Errors:**

| Code | `reason` | Meaning | Suggested message on the screen |
|---|---|---|---|
| 400 | | Missing or invalid `lat`, `lng` or `accuracy` | "Couldn't read your location" |
| 403 | `not_enrolled` | Not in this section | "You're not enrolled in this class" |
| 409 | `already_checked_in` | Already has a mark for this session (also sends `section_id`, the class and `campus`, like the 200) | "You're already checked in" |
| 422 | `expired` | The scan is too old or the code is out of date | "QR expired, scan again" |
| 422 | `no_scan` | No remembered scan | "Scan the QR code first" |
| 422 | `closed` | The session has ended | "Check-in is closed" |
| 422 | `too_far` | Further than `radius_m + accuracy` from the campus centre | "You seem to be off campus" |
| 422 | `low_accuracy` | `accuracy` is over 200 m | "Turn on precise location for Chrome" |

Example error: `422 { "error": "QR expired", "reason": "expired" }`

### `GET /api/my/attendance`
My rate in each class.
- **Who:** Student
- **Returns:**
```json
200 [ { "section_id": 3, "course_code": "CSS326", "course_name": "Database Programming Laboratory",
        "section_no": 1, "attended": 9, "total_sessions": 10, "rate": 90 } ]
```
`attended` counts present and excused. `rate` is a whole-number percentage of closed sessions, from 0 to 100.

### `GET /api/my/classes/:id`
My sessions in one class (`:id` is the section id). Students' routes say "classes" so they aren't mixed up with the instructor's `/api/my/sections`.
- **Who:** Student, only for a section they're enrolled in
- **Returns:**
```json
200 { "section": { "id": 3, "course_code": "CSS326", "course_name": "Database Programming Laboratory", "section_no": 1 },
      "sessions": [ { "session_id": 12, "opened_at": "2026-11-02T09:00:00Z", "closed_at": null, "status": "present" } ] }
```
`status` is `present`, `excused` or `absent`. `closed_at` is `null` while the check-in is still open. In that case `absent` only means "not checked in yet", so the screen should show "In progress" instead of Absent until the session ends. The rate in `GET /api/my/attendance` only counts closed sessions.
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
| Admin `/admin` | users, courses, sections, enrollments, campuses, audit |
| My sections `/instructor` | `GET /api/my/sections` |
| Section `/instructor/sections/:id` | `GET` and `POST /api/sections/:id/sessions`, `GET /api/campuses` (to pick the campus), `GET /api/sections/:id/enrollments`, `POST /api/sections/:id/enrollments/import` |
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
