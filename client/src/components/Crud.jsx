import { useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle, Plus, Search, Trash2, Upload } from 'lucide-react'
import { api } from '../api.js'
import { useLoad } from '../useLoad.js'
import { csvDate, downloadCsv, fileSlug, toCsv } from '../csv.js'
import ImportDialog from './ImportDialog.jsx'

const cap = (s) => s[0].toUpperCase() + s.slice(1)

// Grey placeholder rows while a table loads, inside the card that will hold it.
export const Rows = ({ label }) => (
  <>
    <div aria-hidden="true">
      {[0, 1, 2].map((i) => <div key={i} className="bones"><span className="bone" style={{ width: '40%' }} /><span className="bone" style={{ width: '25%' }} /></div>)}
    </div>
    <p className="sr-only" role="status">Loading {label}</p>
  </>
)

// One admin tab: a toolbar (search, filters, Add), the table, an add/edit dialog and a delete confirm.
// `cfg` holds everything that differs per tab (see pages/Admin.jsx). No `fields` = read only (audit log);
// `edit: false` = add and remove only (enrollments). `tools` goes at the start of the toolbar.
// `importer: { kind, path }` adds an Import CSV button (see ImportDialog).
// Delete lives inside the Edit form, so rows carry one button; tabs without Edit keep it on the row.
// `keep(row)` = this row can't be deleted (the signed-in admin). `note(rows)` = a line under the toolbar.
export default function Crud({ cfg, notify, tools }) {
  const list = useLoad(cfg.path)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null) // null = sheet closed, 'new' = adding, a row = editing that row
  const [doomed, setDoomed] = useState(null) // the row waiting for delete confirmation
  const [importing, setImporting] = useState(false)

  const idOf = cfg.idOf ?? ((r) => r.id)
  const canEdit = cfg.fields && cfg.edit !== false
  const rows = list.data ?? []
  const needle = query.trim().toLowerCase()
  const inFilter = (r, v) => v === 'all' || (typeof cfg.filter.key === 'function' ? cfg.filter.key(r) : r[cfg.filter.key]) === v
  const shown = rows.filter((r) => (!cfg.filter || inFilter(r, filter)) && (!needle || cfg.text(r).toLowerCase().includes(needle)))
  const done = (text) => { list.reload(); notify(text) }

  return (
    <section className="card crud" aria-label={cap(cfg.plural)}>
      <div className="roster-tools">
        {tools}
        {cfg.filter && (
          <div className="filters" role="group" aria-label={cfg.filter.label}>
            {cfg.filter.options.map(([v, label]) => (
              <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {label} <span className="num">{rows.filter((r) => inFilter(r, v)).length}</span>
              </button>
            ))}
          </div>
        )}
        <div className="toolbar-end">
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Find {cfg.plural}</span>
            <input type="search" placeholder={cfg.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {/* Exports what's shown (after filter and search), so the count is in the label. */}
          {cfg.csv && (
            <button className="btn btn-secondary btn-md" disabled={shown.length === 0}
              onClick={() => downloadCsv(`${fileSlug(cfg.file ?? `mahub ${cfg.plural}`)}_${csvDate(new Date())}.csv`, toCsv(cfg.csv, shown))}>
              <Download size={18} aria-hidden="true" />Export <span className="num">{shown.length}</span><span className="sr-only"> {cfg.plural} as CSV</span>
            </button>
          )}
          {cfg.importer && (
            <button className="btn btn-secondary btn-md" onClick={() => setImporting(true)}>
              <Upload size={18} aria-hidden="true" />Import<span className="sr-only"> CSV</span>
            </button>
          )}
          {cfg.fields && (
            <button className="btn btn-primary btn-md" onClick={() => setEditing('new')}>
              <Plus size={18} aria-hidden="true" />{cfg.addLabel ?? `Add ${cfg.noun}`}
            </button>
          )}
        </div>
      </div>

      {list.error && !list.data && <p className="banner banner-error crud-error" role="alert">Couldn't load {cfg.plural}: {list.error.message}</p>}
      {list.data && cfg.note?.(rows) && <p className="crud-note">{cfg.note(rows)}</p>}
      {!list.data && !list.error && <Rows label={cfg.plural} />}
      {list.data && shown.length === 0 && (
        <p className="empty">{rows.length === 0 ? cfg.empty : `No ${cfg.plural} match ${needle ? `"${query.trim()}"` : 'this filter'}.`}</p>
      )}
      {shown.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {cfg.columns.map((c) => <th key={c.label} scope="col" className={c.className}>{c.label}</th>)}
                {cfg.fields && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={idOf(r)}>
                  {cfg.columns.map((c) => <td key={c.label} className={c.className}>{c.cell(r)}</td>)}
                  {cfg.fields && (
                    <td className="cell-action">
                      <div className="row-actions">
                        {canEdit
                          ? <button className="btn btn-secondary btn-sm" onClick={() => setEditing(r)}>Edit<span className="sr-only"> {cfg.name(r)}</span></button>
                          : <button className="btn btn-secondary btn-sm" onClick={() => setDoomed(r)}>{cfg.removeVerb ?? 'Delete'}<span className="sr-only"> {cfg.name(r)}</span></button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rendered only while open, so each opening starts with a fresh form. */}
      {editing && <Sheet cfg={cfg} row={editing === 'new' ? null : editing} rows={rows} onSaved={done} onClose={() => setEditing(null)}
        onDelete={editing !== 'new' && !cfg.keep?.(editing) ? () => setDoomed(editing) : undefined} />}
      {importing && <ImportDialog {...cfg.importer} onDone={(c) => done(cfg.importer.kind.toast(c))} onClose={() => setImporting(false)} />}
      {doomed && <Confirm cfg={cfg} row={doomed} id={idOf(doomed)} onDone={done} onClose={() => setDoomed(null)} />}
    </section>
  )
}

// Add/edit form in a centred dialog (also used by the Courses tab). `initial` pre-fills a new row.
// Per field: `hint` and `when` can read the form's values; `check(value, values)` returns an error shown
// under the field on blur and before saving; `combo` = a type-to-search box over `options` instead of a select;
// `lock(row)` returns a reason the field can't change on this row (shown as its hint).
// `onDelete` adds a Delete button that hands over to the confirm.
// A native <dialog> opened with showModal() traps focus,
// closes on Esc and hands focus back to the button that opened it.
export function Sheet({ cfg, row, rows, initial, onSaved, onClose, onDelete }) {
  const ref = useRef(null)
  const [values, setValues] = useState(() => Object.fromEntries(cfg.fields.map((f) => [f.name, String((row ?? initial)?.[f.name] ?? '')])))
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => { ref.current.showModal() }, [])

  const fields = cfg.fields.filter((f) => !f.when || f.when(values)) // e.g. student number only for students
  const optionsOf = (f) => typeof f.options === 'function' ? f.options(rows) : f.options
  // A combo box holds the label the admin picked; the server wants its value.
  const valueOf = (f) => f.combo ? optionsOf(f).find(([, label]) => label === values[f.name])?.[0] : values[f.name]
  const problem = (f) => f.combo && values[f.name] && valueOf(f) == null ? 'Pick someone from the list.' : f.check?.(values[f.name].trim(), values)
  const recheck = (f) => setFieldError((e) => ({ ...e, [f.name]: problem(f) }))

  async function save(e) {
    e.preventDefault()
    setError('')
    const found = Object.fromEntries(fields.map((f) => [f.name, problem(f)]).filter(([, p]) => p))
    setFieldError(found)
    if (Object.keys(found).length) return document.getElementById(`field-${Object.keys(found)[0]}`).focus()
    setSaving(true)
    const body = Object.fromEntries(fields.map((f) => [f.name, f.number ? Number(valueOf(f)) : String(valueOf(f)).trim()]))
    try {
      if (row) await api.put(`${cfg.path}/${row.id}`, body)
      else await api.post(cfg.path, body)
      onSaved(`${cap(cfg.noun)} ${row ? 'saved' : 'added'}`)
      ref.current.close()
    } catch (err) {
      setSaving(false)
      // A duplicate (409) belongs to the one field that must be unique; anything else goes above the buttons.
      if (err.status === 409 && cfg.unique in body) setFieldError({ [cfg.unique]: err.message })
      else setError(err.message)
    }
  }

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="sheet-title">
      <form onSubmit={save}>
        <h2 id="sheet-title" className="subheading sheet-head">{row ? `Edit ${cfg.noun}` : cfg.addLabel ?? `Add ${cfg.noun}`}</h2>
        <div className="sheet-body">
          {fields.map((f) => {
            const id = `field-${f.name}`
            const err = fieldError[f.name]
            const options = optionsOf(f)
            const locked = f.lock?.(row)
            const hint = locked || (typeof f.hint === 'function' ? f.hint(values) : f.hint)
            const props = {
              id, required: f.required, value: values[f.name], disabled: !!locked,
              onChange: (e) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
              onBlur: () => (f.check || f.combo) && recheck(f),
              'aria-invalid': err ? true : undefined,
              'aria-describedby': [hint && !err && `${id}-hint`, err && `${id}-error`].filter(Boolean).join(' ') || undefined,
            }
            return (
              <div className="field" key={f.name}>
                <label htmlFor={id}>{f.label}{!f.required && <span className="optional"> (optional)</span>}</label>
                {f.combo ? (
                  <>
                    <input {...props} type="search" list={`${id}-list`} placeholder={f.placeholder} autoComplete="off" />
                    <datalist id={`${id}-list`}>{options.map(([v, label]) => <option key={v} value={label} />)}</datalist>
                  </>
                ) : options ? (
                  <select {...props}>
                    <option value="" disabled>Choose…</option>
                    {options.map(([v, label]) => <option key={v} value={String(v)}>{label}</option>)}
                  </select>
                ) : (
                  <input {...props} type={f.number ? 'number' : f.type ?? 'text'} step={f.step} min={f.min} max={f.max}
                    placeholder={f.placeholder} inputMode={f.inputMode} autoCapitalize={f.autoCapitalize} autoComplete="off" />
                )}
                {hint && !err && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
                {err && <span className="field-error" id={`${id}-error`}>{err}</span>}
              </div>
            )
          })}
          {error && <p className="banner banner-error" role="alert">{error}</p>}
        </div>
        <div className="sheet-foot">
          {onDelete && (
            <button type="button" className="btn btn-secondary btn-md sheet-delete" onClick={() => { ref.current.close(); onDelete() }}>
              <Trash2 size={18} aria-hidden="true" />{cfg.removeVerb ?? 'Delete'}<span className="sr-only"> {cfg.name(row)}</span>
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-md" onClick={() => ref.current.close()}>Cancel</button>
          <button className="btn btn-primary btn-md" disabled={saving} aria-busy={saving}>
            {saving && <LoaderCircle size={18} className="spin" aria-hidden="true" />}{row ? 'Save changes' : cfg.addLabel ?? `Add ${cfg.noun}`}
          </button>
        </div>
      </form>
    </dialog>
  )
}

// "Delete X?" with the server's refusal (for example "This course still has sections") shown in place.
export function Confirm({ cfg, row, id, onDone, onClose }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { ref.current.showModal() }, [])
  const verb = cfg.removeVerb ?? 'Delete'

  async function go() {
    setBusy(true)
    setError('')
    try {
      await api.delete(`${cfg.path}/${id}`)
      onDone(`${cap(cfg.noun)} ${verb === 'Remove' ? 'removed' : 'deleted'}`)
      ref.current.close()
    } catch (e) {
      setBusy(false)
      setError(e.message)
    }
  }

  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="confirm-title">
      <h2 id="confirm-title" className="subheading">{verb} {cfg.name(row)}?</h2>
      <p>{cfg.consequence ?? "This can't be undone."}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="btn btn-secondary btn-md" onClick={() => ref.current.close()}>Cancel</button>
        <button className="btn btn-danger btn-md" onClick={go} disabled={busy} aria-busy={busy}>
          {busy && <LoaderCircle size={18} className="spin" aria-hidden="true" />}{verb}
        </button>
      </div>
    </dialog>
  )
}
