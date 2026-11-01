// Stand-in for a screen that isn't built yet (steps 3+ of the plan replace each one).
export default function Placeholder({ title, children }) {
  return (
    <section>
      <h1>{title}</h1>
      {children ?? <p>Not built yet.</p>}
    </section>
  )
}
