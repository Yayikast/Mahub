import { useEffect, useRef } from 'react'
import { CircleCheck } from 'lucide-react'
import PhoneTop from './PhoneTop.jsx'

// How to get a fresh scan: shared by the check-in refusals and /scan-failed. Each step is [what to do, why/where].
export const SCAN_STEPS = [
  ['Open your camera app', "The phone's own camera, not this page"],
  ['Point it at the code on the screen', 'Use the one showing now, not a photo of it'],
  ['Tap the link that appears', "You'll come back here to check in"],
]

// The end of a check-in.
// Success: green screen, `children` is the receipt.
// Failure: the explainer's layout. An `icon` that draws this problem, the headline, a `why` line,
// then "How to fix it" `steps` and/or a `detail` line saying what to do.
// `action` is an optional primary button, `secondary` a quieter one.
export default function Outcome({ ok, title, icon: Icon, why, steps, detail, children, action, secondary }) {
  const heading = useRef(null)
  // On first render: move focus to the headline so screen readers announce the result,
  // and name the browser tab after it. Callers give each attempt a new `key`, so this runs every time.
  useEffect(() => {
    heading.current?.focus()
    document.title = `${title} · Mahub`
  }, [title])

  return (
    <main className={`phone outcome ${ok ? 'outcome-success' : 'outcome-fail'}`}>
      <PhoneTop />
      <div className="phone-body">
        {ok
          ? <CircleCheck size={88} strokeWidth={1.75} aria-hidden="true" className="outcome-icon-success" />
          : <div className="icon-circle icon-circle-danger"><Icon size={36} strokeWidth={2} aria-hidden="true" /></div>}
        <h1 className="result" ref={heading} tabIndex={-1}>{title}</h1>
        {why && <p className="lede">{why}</p>}
        {children}
        {!ok && (steps || detail) && <hr className="divider" />}
        {steps && (
          <>
            <h2 className="subheading">How to fix it</h2>
            <ol className="steps">
              {steps.map(([what, where]) => (
                <li key={what}><span><strong>{what}</strong>{where && <span>{where}</span>}</span></li>
              ))}
            </ol>
          </>
        )}
        {detail && <p className="detail">{detail}</p>}
      </div>
      {(action || secondary) && <div className="phone-bar">{action}{secondary}</div>}
    </main>
  )
}
