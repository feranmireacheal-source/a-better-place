import { createClient } from '@supabase/supabase-js'
export const env = import.meta.env
const url = (env.VITE_SUPABASE_URL ?? '') as string
const key = (env.VITE_SUPABASE_ANON_KEY ?? '') as string
// True only when real values (not the .env.example placeholders) are present
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && !url.includes('YOUR-PROJECT') && key.length > 20 && !key.includes('YOUR_ANON_KEY')
export const supabase = createClient(configured ? url : 'https://placeholder.supabase.co', configured ? key : 'placeholder-key-placeholder')
