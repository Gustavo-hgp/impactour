import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Moeda base de ARMAZENAMENTO: Peso chileno (CLP). Todos os valores no banco
// (custo_pax, recebimentos, caixa) são tratados como CLP. As taxas dizem quanto
// de CLP vale 1 unidade da outra moeda (ex.: 1 USD = 950 CLP, 1 BRL = 170 CLP),
// e são configuradas manualmente pelo usuário (não é cotação de mercado).
export const CURRENCIES = {
  CLP: { label: 'Peso chileno', symbol: '$', locale: 'es-CL', decimals: 0 },
  USD: { label: 'Dólar', symbol: 'US$', locale: 'en-US', decimals: 2 },
  BRL: { label: 'Real', symbol: 'R$', locale: 'pt-BR', decimals: 2 },
}

// Placeholders — o usuário ajusta em Financeiro › câmbio.
const DEFAULT_RATES = { USD: 950, BRL: 170 }

const CurrencyContext = createContext(null)

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency precisa estar dentro de <CurrencyProvider>')
  return ctx
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(
    () => (typeof localStorage !== 'undefined' && localStorage.getItem('moeda')) || 'CLP',
  )
  const [rates, setRates] = useState(DEFAULT_RATES)

  // Carrega as taxas salvas no banco (tabela config).
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', ['taxa_usd', 'taxa_brl'])
      if (!data) return
      setRates((prev) => {
        const next = { ...prev }
        for (const row of data) {
          const n = Number(row.valor)
          if (row.chave === 'taxa_usd' && n > 0) next.USD = n
          if (row.chave === 'taxa_brl' && n > 0) next.BRL = n
        }
        return next
      })
    })()
  }, [])

  const setCurrency = useCallback((c) => {
    setCurrencyState(c)
    if (typeof localStorage !== 'undefined') localStorage.setItem('moeda', c)
  }, [])

  // Salva as taxas no banco e atualiza o estado local.
  const saveRates = useCallback(async (next) => {
    setRates(next)
    if (!supabase) return { error: null }
    const { error } = await supabase.from('config').upsert(
      [
        { chave: 'taxa_usd', valor: next.USD },
        { chave: 'taxa_brl', valor: next.BRL },
      ],
      { onConflict: 'chave' },
    )
    return { error }
  }, [])

  // Converte um valor em CLP (base) para a moeda selecionada e formata.
  const formatMoney = useCallback(
    (valorCLP) => {
      const v = Number(valorCLP) || 0
      const meta = CURRENCIES[currency] || CURRENCIES.CLP
      const converted = currency === 'CLP' ? v : v / (rates[currency] || 1)
      const num = converted.toLocaleString(meta.locale, {
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals,
      })
      return `${meta.symbol} ${num}`
    },
    [currency, rates],
  )

  // Converte um valor digitado em `moeda` para a base CLP (usando as taxas).
  const toCLP = useCallback(
    (valor, moeda) => {
      const v = Number(valor) || 0
      return moeda === 'CLP' ? v : v * (rates[moeda] || 0)
    },
    [rates],
  )

  // Formata um valor que JÁ está na moeda informada, sem conversão.
  const formatIn = useCallback((valor, moeda) => {
    const meta = CURRENCIES[moeda] || CURRENCIES.CLP
    const num = (Number(valor) || 0).toLocaleString(meta.locale, {
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    })
    return `${meta.symbol} ${num}`
  }, [])

  const value = { currency, setCurrency, rates, saveRates, formatMoney, toCLP, formatIn }
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}
