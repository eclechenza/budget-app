import { useState } from 'react'
import { supabase } from '../utils/supabase'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setInfo('Проверьте почту — письмо с подтверждением отправлено')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleMode() {
    setMode(mode === 'login' ? 'signup' : 'login')
    setError(null)
    setInfo(null)
  }

  return (
    <div className="auth-screen">
      <div className="card auth-card">
        <div className="section-title">{mode === 'login' ? 'Вход' : 'Регистрация'}</div>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            className="field-input"
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          {info && <div style={{ color: 'var(--green)', fontSize: 13, marginBottom: 8 }}>{info}</div>}
          <button type="submit" className="btn-primary full" disabled={loading} style={{ marginTop: 0 }}>
            {loading ? 'Подождите...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
        <button className="btn-secondary full" style={{ marginTop: 8 }} onClick={toggleMode}>
          {mode === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  )
}
