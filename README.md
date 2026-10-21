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
4. Bei einer bereits eingerichteten Datenbank mit Euro-Preisen einmalig `supabase/migrate_robux.sql` ausführen. Neue Preise werden ausschließlich in Robux gepflegt.
5. Unter **Authentication → URL Configuration**:
   - **Site URL:** `https://jggaming25.github.io/Ro-Tech-Hub/`
   - **Redirect URLs** ergänzen:
     - `https://jggaming25.github.io/Ro-Tech-Hub/**`
     - `http://localhost:5500/**` (oder den Port deines lokalen Servers)
6. **Authentication → Providers → Email**: Email-Provider aktiviert lassen. Er wird nur für Bestätigungslinks und MFA benötigt; Passwort-Login ist auf der Website deaktiviert. Ein eigener SMTP-Server ist für den Start nicht nötig – Supabase versendet die Links über den integrierten E-Mail-Versand (stark limitiert). Für zuverlässigen Produktivbetrieb später SMTP oder einen Mail-Anbieter hinterlegen.
7. **Authentication → Providers → Discord**: Client-ID und Secret eintragen (Pflicht). Als Redirect/Callback-URL überall verwenden:
   `https://rviulxidohpqgrvbxjqi.supabase.co/auth/v1/callback`
   - Discord-Scopes: `identify email`
   - Google kann deaktiviert bleiben; die Website bietet nur Discord als Login an.
8. **E-Mail-Link:** Unter **Authentication → Emails → Magic Link** muss ein Link enthalten sein, standardmäßig über `{{ .ConfirmationURL }}`:

   ```html
   <p>Bestätige deine Anmeldung: <a href="{{ .ConfirmationURL }}">Zum Ro-Tech Hub</a></p>
   ```

   Es wird kein 6-stelliger Code benötigt. Entferne den Link nicht aus dem Template.
9. **Erster Login:** Nach der Discord-Anmeldung wird automatisch ein Profil erstellt. Bis die E-Mail einmalig per Link bestätigt wurde, leitet die Anmeldeseite auf „Link gesendet“ um. Wer im Konto E-Mail-MFA aktiviert, bekommt danach bei jeder Anmeldung einen Bestätigungslink.

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
# BOT_OWNER_ID optional; Standard: 1128067644046716938
npm start
```

### Bot im Server einladen

Im Developer Portal unter **OAuth2 → URL Generator**:

- Scopes: `bot`, `applications.commands`
- Berechtigungen (empfohlen für den Start): `Administrator`
- Alternativ minimale Rechte: Rollen verwalten, Mitglieder moderieren, Mitglieder kicken, Mitglieder bannen, Nachrichten verwalten, Kanäle verwalten, Nachrichten senden, Links einbetten, Nachrichtenverlauf lesen

Einladungs-URLs:

```
Bot:    https://discord.com/oauth2/authorize?client_id=1562221238967869490&permissions=8&scope=bot%20applications.commands
Server: https://discord.gg/evkSq9eH4e
```

Die Server-Einladung ist bereits in `assets/js/config.js` als `DISCORD_INVITE_URL` hinterlegt und erscheint im Footer.

### Wichtige Einstellungen

- **Privileged Intents** im Developer Portal aktivieren: `Server Members Intent` und `Message Content Intent`.
- Die **Bot-Rolle** in der Rollenhierarchie über alle Rollen setzen, die der Bot vergeben/entfernen soll.
- **Produktrollen:** Beim Anlegen eines Produkts legt der Bot automatisch eine Discord-Rolle an und trägt deren ID am Produkt ein. Beim Löschen eines Produkts wird die Rolle nur entfernt, wenn ihr außer dem Master Admin (`BOT_OWNER_ID`, Standard `1128067644046716938`) niemand mehr angehört. Hat noch ein anderer Nutzer die Rolle, wird der Auftrag als `skipped` markiert und im Log gemeldet. Der Bot prüft die Auftragswarteschlange alle 15 Sekunden. Rollen werden nur vergeben oder entfernt, solange der Bot online läuft; bei Offline bleiben die Aufträge in der Warteschlange.
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

1. Als Master Admin per Discord anmelden → **Verwaltung → Produkte** → Produkt anlegen. Für Game-Pass-Produkte reicht die **Roblox-Game-Pass-ID**; Name, **Preis in Robux** und Beschreibung werden im Formular gepflegt. Die Discord-Rolle wird automatisch erzeugt und muss nicht eingetragen werden.
2. Per Discord anmelden und die E-Mail einmalig bestätigen; die Discord-ID wird automatisch übernommen.
3. Testkauf durchführen → im Adminbereich unter **Käufe** bestätigen → Bot vergibt die Rolle automatisch.
4. Bewertung einreichen → im Adminbereich freigeben → erscheint auf Startseite und Bewertungsseite.
5. Produkt löschen (nur Master Admin): Der Bot entfernt die zugehörige Discord-Rolle, sofern außer dem Master niemand sie noch besitzt.
6. Die Discord-Einladungen sind bereits in `assets/js/config.js` hinterlegt.

## Hinweise

- Die Seite blockiert Mobilgeräte und Konsolen bewusst; sie ist für Desktop/Laptop mit Maus und Tastatur ausgelegt.
- GitHub Pages liefert nur statische Dateien. Der Bot braucht einen eigenen Host (z. B. Railway, Render, VPS).
- Kostenlose Produkte öffnen den hinterlegten Download-Link; bezahlte Produkte laufen über Roblox Gamepass/Abo und werden manuell bestätigt.
