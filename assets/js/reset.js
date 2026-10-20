import { initApp } from './app.js';
import { signOutAndClear } from './supabase.js';

const { session } = await initApp('auth');

if (session) {
  await signOutAndClear();
  window.location.replace('login.html');
}
