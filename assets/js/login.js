import { initApp } from './app.js';
import {
  supabase, prepareAuthStorage, fetchProfile, authRedirectUrl,
  safeNextUrl, clearAuthStorage
} from './supabase.js';
import { toast, setLoading } from './ui.js';

const { session, profile } = await initApp('auth');
const params = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const next = safeNextUrl(params.get('next'), 'account.html');

const messageBox = document.getElementById('auth-message');
const discordPanel = document.getElementById('discord-panel');
const emailPanel = document.getElementById('email-code-panel');
const emailForm = document.getElementById('email-code-form');
const emailInput = document.getElementById('email-code');
const emailTitle = document.getElementById('email-code-title');
const emailSub = document.getElementById('email-code-sub');
const resendButton = document.getElementById('email-resend');
const backButton = document.getElementById('email-back');
const discordButton = document.querySelector('[data-provider="discord"]');

let challengeEmail = '';

function isOtpSession(authSession) {
  try {
    const payload = authSession.access_token.split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return Array.isArray(claims.amr) && claims.amr.some((entry) => entry.method === 'otp');
  } catch {
    return false;
  }
}

function showMessage(message, type = 'error') {
  if (!messageBox) return;
  messageBox.hidden = false;
  messageBox.className = `form-alert form-alert-${type}`;
  messageBox.textContent = message;
}

function hideMessage() {
  if (messageBox) messageBox.hidden = true;
}

function showPanel(panel) {
  if (discordPanel) discordPanel.hidden = panel !== 'discord';
  if (emailPanel) emailPanel.hidden = panel !== 'email';
}

async function sendCode() {
  if (!challengeEmail) return false;
  const { error } = await supabase.auth.signInWithOtp({
    email: challengeEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: authRedirectUrl('login.html', `email_verified=1&next=${encodeURIComponent(next)}`)
    }
  });
  if (error) {
    showMessage(`Der Code konnte nicht gesendet werden: ${error.message}`);
    return false;
  }
  return true;
}

async function startEmailChallenge(targetProfile, mode) {
  challengeEmail = targetProfile.email || '';

  if (!challengeEmail) {
    showMessage('Für dein Konto ist keine E-Mail-Adresse hinterlegt. Bitte wende dich an das Team.');
    return;
  }

  await supabase.auth.signOut();
  prepareAuthStorage(true);

  showPanel('email');
  hideMessage();
  if (emailTitle) {
    emailTitle.textContent = mode === 'mfa' ? 'Bestätigungscode (MFA)' : 'E-Mail bestätigen';
  }
  if (emailSub) {
    emailSub.innerHTML = mode === 'mfa'
      ? 'E-Mail-MFA ist aktiv. Wir haben einen 6-stelligen Code an <strong id="email-code-target"></strong> gesendet.'
      : 'Bei der ersten Anmeldung bestätigst du deine E-Mail-Adresse. Wir haben einen 6-stelligen Code an <strong id="email-code-target"></strong> gesendet.';
  }
  const target = document.getElementById('email-code-target');
  if (target) target.textContent = challengeEmail;

  if (emailInput) {
    emailInput.value = '';
    emailInput.focus();
  }

  if (await sendCode()) {
    toast('Bestätigungscode per E-Mail gesendet.', 'success');
  }
}

if (params.get('verified') === '1') {
  toast('E-Mail bestätigt. Du kannst dich jetzt anmelden.', 'success');
}

const oauthError = params.get('error_description') || hashParams.get('error_description');
if (oauthError) {
  showMessage(decodeURIComponent(oauthError.replace(/\+/g, ' ')));
}

const emailVerifiedReturn = params.get('email_verified') === '1';

if (session && profile) {
  if (profile.blocked) {
    await supabase.auth.signOut();
    clearAuthStorage();
    showMessage('Dieser Account ist gesperrt. Bitte wende dich an das Team.');
    showPanel('discord');
  } else if (emailVerifiedReturn && isOtpSession(session)) {
    if (!profile.email_verified) {
      await supabase.from('profiles').update({ email_verified: true }).eq('id', profile.id);
    }
    window.location.replace(next);
  } else if (!profile.email_verified) {
    await startEmailChallenge(profile, 'verify');
  } else if (profile.mfa_email_enabled) {
    await startEmailChallenge(profile, 'mfa');
  } else {
    window.location.replace(next);
  }
} else if (session && !profile) {
  showMessage('Dein Profil konnte nicht geladen werden. Bitte wende dich an das Team.');
}

discordButton?.addEventListener('click', async () => {
  hideMessage();
  prepareAuthStorage(true);
  setLoading(discordButton, true, 'Weiter zu Discord …');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: authRedirectUrl('login.html', `oauth=1&next=${encodeURIComponent(next)}`),
      scopes: 'identify email'
    }
  });
  if (error) {
    setLoading(discordButton, false);
    showMessage(`Discord-Anmeldung fehlgeschlagen: ${error.message}`);
  }
});

emailForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();
  const token = emailInput?.value.trim() || '';
  const submit = emailForm.querySelector('button[type="submit"]');

  if (!/^\d{6}$/.test(token)) {
    showMessage('Bitte den 6-stelligen Code aus der E-Mail eingeben.');
    return;
  }

  setLoading(submit, true, 'Prüfen …');
  prepareAuthStorage(true);
  const { data, error } = await supabase.auth.verifyOtp({
    email: challengeEmail,
    token,
    type: 'email'
  });
  setLoading(submit, false);

  if (error) {
    showMessage('Code ungültig oder abgelaufen. Bitte fordere einen neuen Code an.');
    return;
  }

  const freshProfile = data.user ? await fetchProfile(data.user.id) : null;
  if (freshProfile?.blocked) {
    await supabase.auth.signOut();
    clearAuthStorage();
    showMessage('Dieser Account ist gesperrt. Bitte wende dich an das Team.');
    showPanel('discord');
    return;
  }
  if (freshProfile && !freshProfile.email_verified) {
    await supabase.from('profiles').update({ email_verified: true }).eq('id', freshProfile.id);
  }

  window.location.replace(next);
});

resendButton?.addEventListener('click', async () => {
  hideMessage();
  setLoading(resendButton, true, 'Senden …');
  const sent = await sendCode();
  setLoading(resendButton, false);
  if (sent) toast('Neuer Bestätigungscode wurde gesendet.', 'success');
});

backButton?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  clearAuthStorage();
  challengeEmail = '';
  showPanel('discord');
  hideMessage();
});
