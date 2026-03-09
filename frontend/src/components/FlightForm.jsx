export const FLIGHT_DEFAULTS = {
  year: 2023, month: 7,
  carrier: "AA", carrier_name: "American Airlines Inc.",
  airport: "ATL", airport_name: "Atlanta GA: Hartsfield-Jackson Atlanta International",
  arr_flights: 1500, arr_del15: 0, carrier_ct: 120, weather_ct: 30,
  nas_ct: 80, security_ct: 1, late_aircraft_ct: 150,
  arr_cancelled: 20, arr_diverted: 5,
}

const FIELDS = [
  { k: "year",             label: "Year",            type: "number", span: 1 },
  { k: "month",            label: "Month",           type: "number", span: 1 },
  { k: "carrier",          label: "Carrier Code",    type: "text",   span: 1 },
  { k: "carrier_name",     label: "Carrier Name",    type: "text",   span: 2 },
  { k: "airport",          label: "Airport Code",    type: "text",   span: 1 },
  { k: "airport_name",     label: "Airport Name",    type: "text",   span: 2 },
  { k: "arr_flights",      label: "Arr. Flights",    type: "number", span: 1 },
  { k: "arr_del15",        label: "Delayed (del15)", type: "number", span: 1 },
  { k: "carrier_ct",       label: "Carrier Ct",      type: "number", span: 1 },
  { k: "weather_ct",       label: "Weather Ct",      type: "number", span: 1 },
  { k: "nas_ct",           label: "NAS Ct",          type: "number", span: 1 },
  { k: "security_ct",      label: "Security Ct",     type: "number", span: 1 },
  { k: "late_aircraft_ct", label: "Late Aircraft",   type: "number", span: 1 },
  { k: "arr_cancelled",    label: "Cancelled",       type: "number", span: 1 },
  { k: "arr_diverted",     label: "Diverted",        type: "number", span: 1 },
]

export default function FlightForm({ form, onChange }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
      gap: ".8rem",
    }}>
      {FIELDS.map(f => (
        <div key={f.k} style={f.span > 1 ? { gridColumn: `span ${f.span}` } : {}}>
          <label className="label" style={{ display: "block", marginBottom: ".3rem" }}>{f.label}</label>
          <input
            className="inp"
            type={f.type}
            value={form[f.k] ?? ""}
            onChange={e => onChange(f.k,
              f.type === "number"
                ? (e.target.value === "" ? "" : Number(e.target.value))
                : e.target.value
            )}
          />
        </div>
      ))}
    </div>
  )
}
