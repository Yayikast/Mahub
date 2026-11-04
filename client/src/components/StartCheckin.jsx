import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleCheck, LoaderCircle } from 'lucide-react'
import { api } from '../api.js'
import { classLabel, useLoad } from '../useLoad.js'

// Campus picker + Start: the section page's panel and the home page's dialog share it.
// onConflict: someone opened a check-in meanwhile (409); the caller reloads so its link shows.
export default function StartCheckin({ sectionId, onConflict, onCancel }) {
  const navigate = useNavigate()
  const campuses = useLoad('/api/campuses')
  const [campusId, setCampusId] = useState(null) // nothing pre-selected (DESIGN.md)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  async function start() {
    setStarting(true)
    setError('')
    try {
      const s = await api.post(`/api/sections/${sectionId}/sessions`, { campus_id: campusId })
      navigate(`/session/${s.id}`)
    } catch (e) {
      setStarting(false)
      if (e.status === 409) onConflict?.()
      else setError("Couldn't start check-in. Check your connection and try again.")
    }
  }

  return (
    <>
      <fieldset className="campus-picker">
        <legend className="sub">Which campus are you teaching at?</legend>
        <div className="options">
          {campuses.data?.map((c) => (
            <label key={c.id} className="option">
              <input type="radio" name={`campus-${sectionId}`} className="sr-only" checked={campusId === c.id} onChange={() => setCampusId(c.id)} />
              <strong>{c.name}</strong>
              <span>Students within {c.radius_m} m can check in</span>
              <CircleCheck size={22} aria-hidden="true" className="option-check" />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="panel-foot">
        {!campusId && <span className="field-hint">Pick a campus to start</span>}
        {onCancel && <button type="button" className="btn btn-secondary btn-md" onClick={onCancel}>Cancel</button>}
        <button type="button" className="btn btn-primary btn-md" onClick={start} disabled={!campusId || starting} aria-busy={starting}>
          {starting && <LoaderCircle size={18} className="spin" aria-hidden="true" />}
          {starting ? 'Starting…' : 'Start check-in'}
        </button>
      </div>
    </>
  )
}

// The same picker in a dialog, so a class can be started from /instructor without opening its page.
export function StartDialog({ section, onConflict, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current.showModal() }, [])
  return (
    <dialog ref={ref} className="modal start-modal" onClose={onClose} aria-labelledby="start-dialog-title">
      <h2 id="start-dialog-title" className="subheading">Start check-in</h2>
      <p>{classLabel(section)} · {section.course_name}</p>
      <StartCheckin sectionId={section.id} onCancel={() => ref.current.close()} onConflict={() => { onConflict(); ref.current.close() }} />
    </dialog>
  )
}
