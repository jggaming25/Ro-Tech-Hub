# Ro-Tech Hub

Statische Website (GitHub Pages) mit Supabase-Backend für Produkte, Bewertungen, Käufe, Benachrichtigungen und einen Discord-Bot mit Moderationsfunktionen.

- **Frontend:** reines HTML/CSS/JavaScript (ES Modules), Supabase JS über CDN
- **Backend:** Supabase (Postgres, Auth, Row Level Security, Storage)
- **Bot:** Node.js + discord.js, läuft separat bei einem Hoster
- **Design:** Orange/Weiß, Hell-/Dunkelmodus, Desktop-only

## Projektstruktur

```
index.html              Startseite
products.html           Produktkatalog mit Filtern
reviews.html            Bewertungen, Vorschläge, eigene Beiträge
account.html            Profil, Sicherheit, Benachrichtigungen, Käufe
login.html              Discord-Login, E-Mail-Bestätigung, MFA
reset.html              Hinweis: Passwort-Login deaktiviert
admin.html              Verwaltung (Admins + Master Admin)

assets/css/styles.css   Design-System
assets/js/              Seitenmodule, UI, Supabase-Client, Guard
assets/img/             SVG-Cover, Favicon, Platzhalter

supabase/schema.sql     Tabellen, RLS, Trigger, Funktionen, Storage
supabase/seed.sql       Beispielprodukte, Willkommens-Hinweis, Bot-Standard

bot/index.js            Discord-Bot (Moderation, Logs, Kauf- und Produktrollen)
bot/.env.example        Vorlage für Server-Geheimnisse
```

## 1. Supabase einrichten

1. Im [Supabase Dashboard](https://supabase.com/dashboard) das Projekt öffnen (`rviulxidohpqgrvbxjqi`).
2. **SQL Editor → New query**: den kompletten Inhalt von `supabase/schema.sql` ausführen.
3. Optional danach `supabase/seed.sql` ausführen (Beispielprodukte + Standard-Bot-Einstellungen).
4. Unter **Authentication → URL Configuration**:
   - **Site URL:** `https://jggaming25.github.io/Ro-Tech-Hub/`
   - **Redirect URLs** ergänzen:
     - `https://jggaming25.github.io/Ro-Tech-Hub/**`
     - `http://localhost:5500/**` (oder den Port deines lokalen Servers)
5. **Authentication → Providers → Email**: Email-Provider aktiviert lassen. Er wird nur für Bestätigungscodes und MFA benötigt; Passwort-Login ist auf der Website deaktiviert.
6. **Authentication → Providers → Discord**: Client-ID und Secret eintragen (Pflicht). Als Redirect/Callback-URL überall verwenden:
   `https://rviulxidohpqgrvbxjqi.supabase.co/auth/v1/callback`
   - Discord-Scopes: `identify email`
   - Google kann deaktiviert bleiben; die Website bietet nur Discord als Login an.
7. **E-Mail-Code:** Unter **Authentication → Emails → Magic Link** muss der 6-stellige Code enthalten sein:

   ```html
   <p>Dein Bestätigungscode: <strong>{{ .Token }}</strong></p>
   ```

   Ohne `{{ .Token }}` können weder die einmalige E-Mail-Bestätigung noch die optionale MFA geprüft werden.
8. **Erster Login:** Nach der Discord-Anmeldung wird automatisch ein Profil erstellt. Bis die E-Mail einmalig per Code bestätigt wurde, leitet die Anmeldeseite auf die Code-Eingabe um. Wer im Konto E-Mail-MFA aktiviert, bekommt danach bei jeder Anmeldung einen Code.

### Master Admin setzen

Zuerst einmal mit Discord anmelden (dadurch entsteht das Profil). Danach im SQL Editor ausführen:

```sql
update public.profiles
set rank = 'master'
where lower(email) = lower('DEINE-EMAIL@example.com');
```

Der Rang `master` kann nur per SQL vergeben werden. Admins ernennt danach der Master Admin im Bereich **Nutzer**.

## 2. Website veröffentlichen (GitHub Pages)

1. Alle Dateien aus diesem Ordner ins Repository `jggaming25/Ro-Tech-Hub` pushen (Root, nicht in einen Unterordner).
2. **Settings → Pages → Build and deployment**: Branch `main`, Ordner `/ (root)`.
3. Nach dem Deploy ist die Seite unter `https://jggaming25.github.io/Ro-Tech-Hub/` erreichbar.

Die Supabase-Zugangsdaten in `assets/js/config.js` sind öffentliche Client-Keys. Der **Service-Role-Key gehört niemals** dorthin.

## 3. Discord-Bot starten

Voraussetzungen: Node.js ≥ 20, ein Discord-Server, Bot-Anwendung im [Developer Portal](https://discord.com/developers/applications).

```powershell
cd bot
npm install
Copy-Item .env.example .env
# .env ausfüllen:
# DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# BOT_OWNER_ID (Discord-ID des Master Admins)
npm start
```

### Bot im Server einladen

Im Developer Portal unter **OAuth2 → URL Generator**:

- Scopes: `bot`, `applications.commands`
- Berechtigungen (empfohlen für den Start): `Administrator`
- Alternativ minimale Rechte: Rollen verwalten, Mitglieder moderieren, Mitglieder kicken, Mitglieder bannen, Nachrichten verwalten, Kanäle verwalten, Nachrichten senden, Links einbetten, Nachrichtenverlauf lesen

Einladungs-URL (Client-ID bereits eingesetzt):

```
https://discord.com/api/oauth2/authorize?client_id=1562221238967869490&permissions=8&scope=bot%20applications.commands
```

### Wichtige Einstellungen

- **Privileged Intents** im Developer Portal aktivieren: `Server Members Intent` und `Message Content Intent`.
- Die **Bot-Rolle** in der Rollenhierarchie über alle Rollen setzen, die der Bot vergeben/entfernen soll.
- **Produktrollen:** Beim Anlegen eines Produkts legt der Bot automatisch eine Discord-Rolle an und trägt deren ID am Produkt ein. Beim Löschen eines Produkts wird die Rolle nur entfernt, wenn ihr außer dem Master Admin (`BOT_OWNER_ID`) niemand mehr angehört. Hat noch ein anderer Nutzer die Rolle, wird der Auftrag als `skipped` markiert und im Log gemeldet. Ohne gesetzte `BOT_OWNER_ID` löscht der Bot aus Sicherheitsgründen keine Produktrollen. Der Bot prüft die Auftragswarteschlange alle 15 Sekunden.
- Im Hub unter **Verwaltung → Discord-Bot** (nur Master Admin):
  - Server-ID, Log-Kanal, Willkommens-Kanal, Mute-Rolle eintragen
  - Moderator-Rollen-IDs und Auto-Rollen-IDs (kommagetrennt)
  - AutoMod, Logs, Warnschwellen, Kauf-Rollen-Sync und deaktivierte Befehle konfigurieren
  - Der Bot lädt die Einstellungen alle 30 Sekunden neu; der Heartbeat zeigt „Online“.

### Befehle

`/warn`, `/warnings`, `/clearwarnings`, `/kick`, `/ban`, `/unban`, `/timeout`, `/untimeout`, `/purge`, `/slowmode`, `/lock`, `/unlock`, `/nickname`, `/role`, `/userinfo`, `/serverinfo`, `/say`, `/help`, `/botinfo`, `/ping`

Jede Moderationsaktion verlangt einen Grund und wird – sofern aktiviert – im Log-Kanal und in `moderation_actions` protokolliert.

## 4. Sicherheit

- Der Bot-Token und das Discord-Client-Secret wurden im Chat geteilt. **Beide sofort rotieren** (Developer Portal → Bot → Reset Token; OAuth2 → Reset Secret).
- `bot/.env` niemals committen (steht in `.gitignore`).
- Der Service-Role-Key darf ausschließlich auf dem Bot-Host liegen.
- Nach Änderungen an `schema.sql` die Datei erneut im SQL Editor ausführen; sie ist wiederholbar aufgebaut (`if not exists`, `drop policy if exists`).

## 5. Erste Schritte nach dem Setup

1. Als Master Admin per Discord anmelden → **Verwaltung → Produkte** → Beispielprodukte öffnen und Roblox-IDs, Preise und Download-Links eintragen. Die Discord-Rolle wird beim Anlegen automatisch erzeugt.
2. Per Discord anmelden und die E-Mail einmalig bestätigen; die Discord-ID wird automatisch übernommen.
3. Testkauf durchführen → im Adminbereich unter **Käufe** bestätigen → Bot vergibt die Rolle automatisch.
4. Bewertung einreichen → im Adminbereich freigeben → erscheint auf Startseite und Bewertungsseite.
5. Produkt löschen (nur Master Admin): Der Bot entfernt die zugehörige Discord-Rolle, sofern außer dem Master/Owner niemand sie noch besitzt.
6. Discord-Invite in `assets/js/config.js` bei `DISCORD_INVITE_URL` eintragen (optional).

## Hinweise

- Die Seite blockiert Mobilgeräte und Konsolen bewusst; sie ist für Desktop/Laptop mit Maus und Tastatur ausgelegt.
- GitHub Pages liefert nur statische Dateien. Der Bot braucht einen eigenen Host (z. B. Railway, Render, VPS).
- Kostenlose Produkte öffnen den hinterlegten Download-Link; bezahlte Produkte laufen über Roblox Gamepass/Abo und werden manuell bestätigt.
