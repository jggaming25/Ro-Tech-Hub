-- Einmalig ausführen, um bestehende Euro-Preise auf Robux umzustellen.
-- Der Faktor 100 entspricht den bisherigen Beispielpreisen (24,99 EUR -> 2499 Robux).
-- Produkte, die bereits ROBUX nutzen, werden nicht erneut umgerechnet.

update public.products
set price = round(price * 100),
    currency = 'ROBUX'
where currency is distinct from 'ROBUX';

update public.purchases
set amount = round(amount * 100),
    currency = 'ROBUX'
where currency is distinct from 'ROBUX';
