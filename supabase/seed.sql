-- ============================================================
--  Ro-Tech Hub · Beispielinhalte
--  Optional nach schema.sql ausführen.
--  Bilder und Roblox-IDs sind Platzhalter und im Adminbereich änderbar.
-- ============================================================

insert into public.products (
  id, name, description, image_url, category, price, currency,
  for_sale, on_sale, discount_percent, visible, purchase_type,
  roblox_gamepass_id, roblox_subscription_id, discord_role_id, download_url, created_at
) values
(
  '11111111-1111-4111-8111-111111111111',
  'Neon Core Script Pack',
  'Ein komplettes Script-Paket mit moderner UI, Automatisierungen und Performance-Optimierungen für deine Roblox-Erfahrung. Inklusive Dokumentation und Updates.',
  'assets/img/cover-1.svg',
  'Scripts', 2499, 'ROBUX', true, true, 20, true, 'gamepass',
  '0000000001', null, null, null, now() - interval '2 days'
),
(
  '22222222-2222-4222-8222-222222222222',
  'Apex Vault 3D Assets',
  'Hochwertige 3D-Modelle, Maps und Effekte. Optimiert für niedrige Draw-Calls und direkt in deinem Projekt einsetzbar.',
  'assets/img/cover-2.svg',
  '3D-Assets', 3900, 'ROBUX', true, false, 0, true, 'gamepass',
  '0000000002', null, null, null, now() - interval '5 days'
),
(
  '33333333-3333-4333-8333-333333333333',
  'Forge Kit Developer Tools',
  'Ein Werkzeugkasten für Entwickler: Build-Helfer, Debug-Overlays, Optimierungs-Tools und praktische Plugins.',
  'assets/img/cover-3.svg',
  'Tools', 1450, 'ROBUX', true, true, 15, true, 'subscription',
  null, '0000000003', null, null, now() - interval '8 days'
),
(
  '44444444-4444-4444-8444-444444444444',
  'Signal UI Template',
  'Ein modernes, responsives UI-System für Roblox-Spiele. Fertige Komponenten, Animationen und ein sauberes Theme-System.',
  'assets/img/cover-4.svg',
  'Vorlagen', 999, 'ROBUX', true, false, 0, true, 'gamepass',
  '0000000004', null, null, null, now() - interval '12 days'
),
(
  '55555555-5555-4555-8555-555555555555',
  'Orbit Suite Bundle',
  'Das Rundum-Paket: alle aktuellen Scripts, Assets und Templates in einem Bundle. Einmal kaufen, dauerhaft profitieren.',
  'assets/img/cover-5.svg',
  'Bundles', 7900, 'ROBUX', true, true, 25, true, 'gamepass',
  '0000000005', null, null, null, now() - interval '15 days'
),
(
  '66666666-6666-4666-8666-666666666666',
  'Pulse Board Analytics',
  'Ein übersichtliches Analytics-Dashboard für deine Roblox-Community. Aktuell in Entwicklung – bald verfügbar.',
  'assets/img/cover-6.svg',
  'Analytics', 0, 'ROBUX', false, false, 0, false, 'free',
  null, null, null, null, now() - interval '20 days'
)
on conflict (id) do nothing;

insert into public.notifications (id, user_id, title, body, kind, link, is_active, created_at)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  null,
  'Willkommen im Ro-Tech Hub',
  'Schön, dass du da bist. Entdecke unsere aktuellen Produkte, teile deine Bewertung und sichere dir exklusive Aktionen.',
  'info',
  'products.html',
  true,
  now()
)
on conflict (id) do nothing;


insert into public.bot_settings (id, bot_activity, welcome_message)
values (1, 'Ro-Tech Hub', 'Willkommen {user} auf {server}! Schön, dass du da bist.')
on conflict (id) do nothing;
