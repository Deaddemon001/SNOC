<template>
  <div class="login-wrapper">
    <div class="login-glow"></div>
    <div class="login-card">
      <div class="logo">
        <div class="logo-icon">&#128225;</div>
        <h1>Smart NOC</h1>
        <p>v{{ appVersion }} &mdash; Network Operations Center</p>
      </div>
      <div v-if="error" class="login-error">{{ error }}</div>
      <div class="form-group">
        <label>Username</label>
        <input v-model="username" type="text" placeholder="Enter username" autocomplete="username" autofocus @keydown.enter="doLogin" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input v-model="password" type="password" placeholder="Enter password" autocomplete="current-password" @keydown.enter="doLogin" />
      </div>
      <button class="login-btn" :disabled="loading" @click="doLogin">
        {{ loading ? 'Authenticating...' : 'Login' }}
      </button>
      <div class="footer">Secure access &mdash; Smart NOC v{{ appVersion }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const appVersion = window.__APP_VERSION__ || '0.5.6.4'

async function doLogin() {
  if (!username.value.trim() || !password.value) {
    error.value = 'Please enter username and password'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: username.value.trim(), password: password.value })
    })
    const d = await r.json()
    if (d.success) {
      router.push('/')
    } else {
      error.value = d.error || 'Login failed'
      loading.value = false
    }
  } catch (e) {
    error.value = 'Connection error. Is the server running?'
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrapper {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #050c13;
  font-family: 'Rajdhani', sans-serif;
}
.login-wrapper::before {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,229,255,0.015) 2px, rgba(0,229,255,0.015) 4px);
  pointer-events: none;
  z-index: 0;
}
.login-wrapper::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image: linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  z-index: 0;
}
.login-glow {
  position: fixed;
  width: 600px; height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 0;
}
.login-card {
  position: relative;
  z-index: 10;
  background: rgba(10, 21, 32, 0.95);
  border: 1px solid #0f2a3f;
  border-radius: 12px;
  padding: 44px 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 0 60px rgba(0,229,255,0.08), 0 0 120px rgba(0,0,0,0.8);
}
.login-card::before {
  content: '';
  position: absolute;
  top: 0; left: 20%; right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #00e5ff, transparent);
}
.logo { text-align: center; margin-bottom: 32px; }
.logo-icon {
  width: 52px; height: 52px;
  border: 2px solid #00e5ff; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  margin: 0 auto 14px;
  box-shadow: 0 0 20px rgba(0,229,255,0.3);
  animation: pulse 2.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(0,229,255,0.3); }
  50% { box-shadow: 0 0 40px rgba(0,229,255,0.7); }
}
.logo h1 {
  font-size: 24px; font-weight: 700;
  letter-spacing: 4px; color: #00e5ff;
  text-shadow: 0 0 20px rgba(0,229,255,0.5);
}
.logo p {
  font-size: 11px; color: #3a6070;
  letter-spacing: 2px;
  font-family: 'Share Tech Mono', monospace;
  margin-top: 4px;
}
.form-group { margin-bottom: 20px; }
.form-group label {
  display: block; font-size: 10px;
  letter-spacing: 2px; color: #5c7d92;
  margin-bottom: 8px;
  font-family: 'Share Tech Mono', monospace;
}
.form-group input {
  width: 100%;
  background: rgba(0, 229, 255, 0.03);
  border: 1px solid #0f2a3f;
  border-radius: 6px;
  padding: 12px 14px;
  color: #cde8f5;
  font-family: 'Rajdhani', sans-serif;
  font-size: 15px;
  outline: none;
  transition: all 0.2s ease;
}
.form-group input:focus {
  border-color: #00e5ff;
  box-shadow: 0 0 15px rgba(0,229,255,0.15);
  background: rgba(0, 229, 255, 0.05);
}
.form-group input::placeholder { color: #2a4a5f; }
.login-error {
  background: rgba(255,45,85,0.08);
  border: 1px solid rgba(255,45,85,0.3);
  color: #ff2d55;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 18px;
  text-align: center;
}
.login-btn {
  width: 100%;
  background: linear-gradient(135deg, rgba(0,229,255,0.12), rgba(0,229,255,0.04));
  border: 1px solid #00e5ff;
  color: #00e5ff;
  padding: 13px;
  border-radius: 6px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
}
.login-btn:hover:not(:disabled) {
  background: rgba(0,229,255,0.2);
  box-shadow: 0 0 25px rgba(0,229,255,0.4);
}
.login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.footer {
  text-align: center;
  margin-top: 24px;
  font-size: 10px;
  color: #2a4a5f;
  letter-spacing: 1px;
  font-family: 'Share Tech Mono', monospace;
}
</style>
