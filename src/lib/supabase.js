import { createClient } from '@supabase/supabase-js'

const runtime = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {}

const url = runtime.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
const anonKey = runtime.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = supabaseConfigured
  ? createClient(url, anonKey)
  : null
