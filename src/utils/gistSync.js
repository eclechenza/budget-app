const CONFIG_KEY = 'budget_gist_config'

export function loadGistConfig() {
  try {
    const r = localStorage.getItem(CONFIG_KEY)
    return r ? JSON.parse(r) : null
  } catch { return null }
}

function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {}
}

export async function connectGist(token) {
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!userRes.ok) throw new Error('Неверный токен или недостаточно прав')

  const createRes = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'Budget Tracker — AI sync',
      public: false,
      files: { 'budget-data.json': { content: '{}' } }
    })
  })
  if (!createRes.ok) throw new Error('Не удалось создать Gist')

  const gist = await createRes.json()
  const rawUrl = `https://gist.githubusercontent.com/${gist.owner.login}/${gist.id}/raw/budget-data.json`
  const config = { token, gistId: gist.id, gistUrl: gist.html_url, rawUrl, lastSync: null, lastError: null }
  saveConfig(config)
  return config
}

export async function syncToGist(state) {
  const config = loadGistConfig()
  if (!config?.token || !config?.gistId) return

  const content = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)
  const res = await fetch(`https://api.github.com/gists/${config.gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: { 'budget-data.json': { content } } })
  })

  const now = new Date().toISOString()
  if (res.ok) {
    saveConfig({ ...config, lastSync: now, lastError: null })
  } else {
    saveConfig({ ...config, lastError: `HTTP ${res.status}`, lastErrorAt: now })
    throw new Error(`GitHub API ${res.status}`)
  }
}

export function disconnectGist() {
  localStorage.removeItem(CONFIG_KEY)
}
