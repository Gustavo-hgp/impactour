import { CURRENCIES } from '../lib/currency.jsx'

// Máscara monetária "edit from right": digita só dígitos, os N últimos
// (decimais da moeda) viram parte fracionária. Locale do formatador vem da
// moeda: CLP sem decimais ($ 30.000), BRL com vírgula (R$ 30.000,00), USD com
// ponto (US$ 30,000.00). O `value`/`onChange` operam em número (string), não
// na string mascarada — o save dos formulários (Number(value)) continua igual.
export default function MoneyInput({
  value,
  onChange,
  moeda = 'CLP',
  className = 'input',
  placeholder,
  ...props
}) {
  const meta = CURRENCIES[moeda] || CURRENCIES.CLP
  const factor = Math.pow(10, meta.decimals)

  const display =
    value === '' || value == null || Number.isNaN(Number(value))
      ? ''
      : Number(value).toLocaleString(meta.locale, {
          minimumFractionDigits: meta.decimals,
          maximumFractionDigits: meta.decimals,
        })

  const placeholderDefault = (0).toLocaleString(meta.locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  })

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '')
    if (!digits) return onChange('')
    onChange(String(Number(digits) / factor))
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      className={className}
      value={display}
      onChange={handleChange}
      placeholder={placeholder ?? placeholderDefault}
    />
  )
}
