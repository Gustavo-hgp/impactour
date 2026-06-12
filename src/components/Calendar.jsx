import { DayPicker } from 'react-day-picker'
import { ptBR } from 'react-day-picker/locale'
import 'react-day-picker/style.css'

// Cores da marca IMPACTOUR aplicadas via CSS vars do react-day-picker.
const brandStyle = {
  '--rdp-accent-color': '#0a3fa8',
  '--rdp-accent-background-color': '#e8effb',
  '--rdp-today-color': '#e11d2a',
  '--rdp-range_middle-background-color': '#e8effb',
  '--rdp-range_middle-color': '#072e7d',
}

export default function Calendar(props) {
  return (
    <div style={brandStyle} className="rdp-impactour">
      <DayPicker locale={ptBR} weekStartsOn={1} {...props} />
    </div>
  )
}
