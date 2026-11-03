import { useEffect, useState } from 'react'
import { api } from './api.js'

// GET `path` when the page opens, and again every `everyMs` if given (the live roster polls every 3 s).
// The effect's cleanup stops the timer when the page closes or the path changes, so polling never leaks.
// A failed poll keeps the last good data on screen and sets `error`; the next success clears it.
export function useLoad(path, everyMs) {
  const [state, setState] = useState({})
  const [tick, setTick] = useState(0) // bumping this re-runs the effect: that's `reload()`

  useEffect(() => {
    let alive = true // ignore answers that arrive after the page has closed
    const run = () => api.get(path).then(
      (data) => alive && setState({ data }),
      (error) => alive && setState((s) => ({ ...s, error })),
    )
    run()
    const timer = everyMs && setInterval(run, everyMs)
    return () => { alive = false; clearInterval(timer) }
  }, [path, everyMs, tick])

  return { ...state, reload: () => setTick((n) => n + 1) }
}

export const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
// "CSS326 · Section 1": a section, or the roster's `section` object.
export const classLabel = (s) => `${s.course_code} · Section ${s.section_no}`
// A class's course colour and pattern as banner attributes: its course's place among that term's course
// codes in the instructor's list, so My classes, the class page, the live page and the summary agree.
// No attributes (the Lagoon band) until the list arrives or when the class isn't in it.
export const courseLook = (sections, s) => {
  const codes = [...new Set((sections ?? []).filter((x) => x.term === s?.term).map((x) => x.course_code))].sort()
  const i = s ? codes.indexOf(s.course_code) : -1
  return i < 0 ? {} : { 'data-tone': i % 5, 'data-motif': i % 3 }
}
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
// "4:00 PM–5:30 PM", or one time when both fall in the same minute (or there's no end yet).
export const fmtTimes = (from, to) => {
  const a = fmtTime(from), b = to && fmtTime(to)
  return b && b !== a ? `${a}–${b}` : a
}
