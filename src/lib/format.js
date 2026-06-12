export const money = (v) =>
  (Number(v) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const todayISO = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
