// The Mahub logo: an ink tile with three QR-code corners and a location pin in the fourth
// (check-in = scan the QR, at the right place), then the lowercase name.
import { Link } from 'react-router-dom'

const CORNERS = [[6, 6], [15, 6], [6, 15]]

// `to`: the logo becomes a link home (desktop top bar). Phone screens leave it plain, so a stray tap
// can't pull a student out of a check-in in progress.
export default function Logo({ to }) {
  const Tag = to ? Link : 'span'
  return (
    <Tag className="wordmark" {...(to && { to, 'aria-label': 'mahub, home' })}>
      <svg className="logo-mark" viewBox="2 2 24 24" aria-hidden="true">
        <rect className="logo-bg" x="2" y="2" width="24" height="24" rx="6" />
        {CORNERS.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x + 0.5} y={y + 0.5} width="6" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x={x + 2} y={y + 2} width="3" height="3" rx="0.6" fill="currentColor" />
          </g>
        ))}
        <path d="M18.5 22.4c0 0-3-2.6-3-4.5a3 3 0 0 1 6 0c0 1.9-3 4.5-3 4.5z" fill="currentColor" />
        <circle className="logo-bg" cx="18.5" cy="17.9" r="1.15" />
      </svg>
      mahub
    </Tag>
  )
}
