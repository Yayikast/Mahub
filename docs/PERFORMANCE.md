# Performance: indexes and EXPLAIN ANALYZE (issue #26)

Mahub's tables are small today, so every query is fast. This page adds a lot of rows to see which
queries slow down, then adds an index and measures again.

## Setup

- PostgreSQL 16 on a local scratch database (not Supabase), default settings, tables from `db/schema.sql` and the views and
  functions from `db/functions.sql`. The data comes from `db/perf_data.sql`.
- Rows: 20,100 users (20,000 students), 1,000 sections, 100,000 enrollments, 15,000 class sessions,
  **1,199,768 attendance rows** (each student attended about 80%) and **600,000 check-in attempts**.
- The audit trigger is switched off while the data loads, or it would write 1.2 million audit rows.
- Times are `Execution Time` from `EXPLAIN (ANALYZE, COSTS OFF)`. The table below is the **median of 9 warm runs**.
  The plans further down are one run each, so their times differ a little.

## The queries

These are the real queries of the app, with the ids filled in.

| | Query | Where it is used |
|---|---|---|
| Q1 | `SELECT * FROM v_student_attendance WHERE student_id = 10100` | a student's classes with attended / total / rate |
| Q2 | `SELECT ... FROM v_session_roster WHERE session_id = 7500 ORDER BY ...` | the instructor's roster (`GET /api/sessions/:id/roster`) |
| Q3 | `SELECT ... FROM checkin_attempts ca JOIN users u ... WHERE ca.session_id = 7500 ORDER BY ca.created_at DESC, ca.id DESC` | "who tried" list (`GET /api/sessions/:id/attempts`) |
| Q4 | the session list with present and enrolled counts, `WHERE cs.section_id = 500` | the instructor's section page (`GET /api/sections/:id/sessions`) |

## Result

The three indexes (added to `db/schema.sql`):

```sql
CREATE INDEX enrollments_student_id_idx      ON enrollments (student_id);
CREATE INDEX class_sessions_section_id_idx   ON class_sessions (section_id);
CREATE INDEX checkin_attempts_session_id_idx ON checkin_attempts (session_id);
```

| | Before | After | Change |
|---|---|---|---|
| Q1 student attendance | 18.0 ms | 1.7 ms | about 10x faster |
| Q3 attempts of a session | 22.4 ms | 0.6 ms | about 38x faster |
| Q2 roster | 0.9 ms | 0.8 ms | no change (already used the primary keys) |
| Q4 section's sessions | 2.5 ms | 2.2 ms | about the same, within the noise of this test |

## Q3: check-in attempts of a session (22.4 ms to 0.6 ms)

`checkin_attempts.session_id` is a foreign key, but Postgres does not index a foreign key by itself, and
the table's only index is its own primary key (`id`). So the only way to find one session's rows was to read the whole table.

Before (no index):

```text
Gather Merge (actual time=19.715..22.720 rows=35 loops=1)
  Workers Planned: 2
  Workers Launched: 2
  ->  Sort (actual time=16.914..16.916 rows=12 loops=3)
        Sort Key: ca.created_at DESC, ca.id DESC
        Sort Method: quicksort  Memory: 25kB
        Worker 0:  Sort Method: quicksort  Memory: 26kB
        Worker 1:  Sort Method: quicksort  Memory: 25kB
        ->  Nested Loop (actual time=2.145..16.854 rows=12 loops=3)
              ->  Parallel Seq Scan on checkin_attempts ca (actual time=2.111..16.542 rows=12 loops=3)
                    Filter: (session_id = 7500)
                    Rows Removed by Filter: 199988
              ->  Index Scan using users_pkey on users u (actual time=0.023..0.023 rows=1 loops=35)
                    Index Cond: (id = ca.user_id)
Planning Time: 0.483 ms
Execution Time: 22.840 ms
```

It reads all 600,000 rows (about 200,000 per worker, shown as `Rows Removed by Filter`) to keep 35. Postgres even
starts two extra parallel workers to do it.

After (`checkin_attempts_session_id_idx`):

```text
Sort (actual time=0.478..0.481 rows=35 loops=1)
  Sort Key: ca.created_at DESC, ca.id DESC
  Sort Method: quicksort  Memory: 27kB
  ->  Nested Loop (actual time=0.068..0.370 rows=35 loops=1)
        ->  Bitmap Heap Scan on checkin_attempts ca (actual time=0.036..0.163 rows=35 loops=1)
              Recheck Cond: (session_id = 7500)
              Heap Blocks: exact=35
              ->  Bitmap Index Scan on checkin_attempts_session_id_idx (actual time=0.023..0.024 rows=35 loops=1)
                    Index Cond: (session_id = 7500)
        ->  Index Scan using users_pkey on users u (actual time=0.005..0.005 rows=1 loops=35)
              Index Cond: (id = ca.user_id)
Planning Time: 0.560 ms
Execution Time: 0.532 ms
```

The Bitmap Index Scan goes straight to the 35 matching rows. Nothing else in the plan changed.

## Q1: a student's attendance (18.0 ms to 1.7 ms)

For each class of the student, this view counts sessions and attendance and calls `attendance_rate()`. Two things were slow.

1. **Finding the student's classes.** `enrollments` has the primary key (`section_id`, `student_id`). An index
   can only be searched from its first column, so "all rows with `student_id = 10100`" could not use it.
   The plan visited all 1,000 sections and probed the key 1,000 times (`loops=1000`).
2. **Counting a section's sessions.** `class_sessions` had no index on `section_id` (the only extra index is the one
   for open sessions). Each count read all 15,000 sessions (`Rows Removed by Filter: 14985`), 10 times in this query.
   `attendance_rate()` runs a similar count for each class too; its own queries don't show in this plan, but they
   run inside the total.

Before (no indexes):

```text
Nested Loop (actual time=3.563..19.384 rows=5 loops=1)
  Join Filter: (s.course_id = c.id)
  Rows Removed by Join Filter: 495
  ->  Seq Scan on courses c (actual time=0.008..0.015 rows=100 loops=1)
  ->  Materialize (actual time=0.000..0.015 rows=5 loops=100)
        ->  Nested Loop (actual time=0.021..1.494 rows=5 loops=1)
              ->  Seq Scan on sections s (actual time=0.005..0.069 rows=1000 loops=1)
              ->  Index Only Scan using enrollments_pkey on enrollments e (actual time=0.001..0.001 rows=0 loops=1000)
                    Index Cond: ((section_id = s.id) AND (student_id = 10100))
                    Heap Fetches: 0
  SubPlan 1
    ->  Aggregate (actual time=1.217..1.217 rows=1 loops=5)
          ->  Nested Loop (actual time=0.100..1.213 rows=13 loops=5)
                ->  Seq Scan on class_sessions cs (actual time=0.040..1.070 rows=15 loops=5)
                      Filter: ((closed_at IS NOT NULL) AND (section_id = s.id))
                      Rows Removed by Filter: 14985
                ->  Index Only Scan using attendance_pkey on attendance a (actual time=0.008..0.008 rows=1 loops=75)
                      Index Cond: ((session_id = cs.id) AND (student_id = e.student_id))
                      Heap Fetches: 0
  SubPlan 2
    ->  Aggregate (actual time=0.934..0.937 rows=1 loops=5)
          ->  Seq Scan on class_sessions cs_1 (actual time=0.025..0.930 rows=15 loops=5)
                Filter: ((closed_at IS NOT NULL) AND (section_id = s.id))
                Rows Removed by Filter: 14985
Planning Time: 1.728 ms
Execution Time: 19.602 ms
```

After (`enrollments_student_id_idx` and `class_sessions_section_id_idx`):

```text
Nested Loop (actual time=0.650..1.418 rows=5 loops=1)
  ->  Hash Join (actual time=0.055..0.173 rows=5 loops=1)
        Hash Cond: (s.id = e.section_id)
        ->  Seq Scan on sections s (actual time=0.004..0.061 rows=1000 loops=1)
        ->  Hash (actual time=0.039..0.040 rows=5 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 9kB
              ->  Bitmap Heap Scan on enrollments e (actual time=0.021..0.035 rows=5 loops=1)
                    Recheck Cond: (student_id = 10100)
                    Heap Blocks: exact=5
                    ->  Bitmap Index Scan on enrollments_student_id_idx (actual time=0.012..0.013 rows=5 loops=1)
                          Index Cond: (student_id = 10100)
  ->  Index Scan using courses_pkey on courses c (actual time=0.002..0.002 rows=1 loops=5)
        Index Cond: (id = s.course_id)
  SubPlan 1
    ->  Aggregate (actual time=0.104..0.104 rows=1 loops=5)
          ->  Nested Loop (actual time=0.017..0.102 rows=13 loops=5)
                ->  Bitmap Heap Scan on class_sessions cs (actual time=0.008..0.043 rows=15 loops=5)
                      Recheck Cond: (section_id = s.id)
                      Filter: (closed_at IS NOT NULL)
                      Heap Blocks: exact=75
                      ->  Bitmap Index Scan on class_sessions_section_id_idx (actual time=0.005..0.005 rows=15 loops=5)
                            Index Cond: (section_id = s.id)
                ->  Index Only Scan using attendance_pkey on attendance a (actual time=0.004..0.004 rows=1 loops=75)
                      Index Cond: ((session_id = cs.id) AND (student_id = e.student_id))
                      Heap Fetches: 0
  SubPlan 2
    ->  Aggregate (actual time=0.013..0.013 rows=1 loops=5)
          ->  Bitmap Heap Scan on class_sessions cs_1 (actual time=0.004..0.011 rows=15 loops=5)
                Recheck Cond: (section_id = s.id)
                Filter: (closed_at IS NOT NULL)
                Heap Blocks: exact=75
                ->  Bitmap Index Scan on class_sessions_section_id_idx (actual time=0.002..0.002 rows=15 loops=5)
                      Index Cond: (section_id = s.id)
Planning Time: 1.436 ms
Execution Time: 1.528 ms
```

The student's 5 enrollments now come from an index (`rows=5`, no 1,000-row loop), and each section's sessions come from
`class_sessions_section_id_idx` (15 rows each time, nothing removed). Adding one index at a time (same data, medians):
`class_sessions(section_id)` alone gave about 4 ms, with `enrollments(student_id)` too 1.7 ms. Both are worth keeping.

## Q2 and Q4: no real change

Q2 was already fast: the roster is found through the primary keys of `class_sessions`, `enrollments`
(`section_id` first) and `attendance` (`session_id` first). Q4 reads 15 sessions of one section out of 15,000; the
index replaces a 15,000-row scan that only took about 2 ms to begin with, so the difference is small.
The point is that an index is not always needed: the first column of a primary key already serves the common queries.

## What the indexes cost

- Size: 1.1 MB, 0.1 MB and 4.3 MB, against 78 MB for `attendance` and 38 MB for `checkin_attempts`.
- Every INSERT, UPDATE of that column and DELETE on these three tables also updates the index. Mahub writes a few rows per
  class (check-ins, enrollments, sessions), so the extra cost is negligible next to the reads it saves. Not measured here.

## Run it again

```sh
createdb perf
psql perf -f db/schema.sql -f db/functions.sql -f db/perf_data.sql
# "before": drop the three indexes, then EXPLAIN ANALYZE each query above
psql perf -c "DROP INDEX enrollments_student_id_idx, class_sessions_section_id_idx, checkin_attempts_session_id_idx"
# "after": run the CREATE INDEX lines from the Result section
```

On Supabase, run the three `CREATE INDEX IF NOT EXISTS` lines at the end of `db/schema.sql` once in the SQL editor
(the schema was created before they existed). They are safe to run again.
