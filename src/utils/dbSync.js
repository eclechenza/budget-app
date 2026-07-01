import { supabase } from './supabase'
import { loadState, saveState } from './storage'
import { applyImport } from './exportImport'

const ROUTE_KEY = 'budget_route'
const RATES_KEY = 'budget_rates_history'
const BIRTH_KEY = 'budget_birthdate'

function readLocalJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

async function pullFromSupabase(userId) {
  const { data, error } = await supabase
    .from('budget_data')
    .select('budget_state, route_data, rates_data, birth_date')
    .eq('user_id', userId)
    .single()
  if (error || !data) return

  applyImport({
    version: 1,
    budgetState: data.budget_state,
    routeData: data.route_data,
    ratesData: data.rates_data,
    birthDate: data.birth_date,
  })
  saveState(data.budget_state)
}

// First login ever for this account -> push local data up.
// Any later login -> DB is source of truth, pull it down instead.
export async function migrateIfNeeded(userId) {
  const { data: existing } = await supabase
    .from('budget_data')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await pullFromSupabase(userId)
    return
  }

  await supabase.from('budget_data').insert({
    user_id: userId,
    budget_state: loadState(),
    route_data: readLocalJSON(ROUTE_KEY) || {},
    rates_data: readLocalJSON(RATES_KEY) || {},
    birth_date: localStorage.getItem(BIRTH_KEY) || null,
  })
}

export async function syncToSupabase(userId, budgetState) {
  if (!userId) return
  await supabase.from('budget_data').update({ budget_state: budgetState }).eq('user_id', userId)
}

export async function syncRouteToSupabase(userId, routeData) {
  if (!userId) return
  await supabase.from('budget_data').update({ route_data: routeData }).eq('user_id', userId)
}
