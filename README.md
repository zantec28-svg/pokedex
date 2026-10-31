# Pokédex 

1 carte par Pokémon, cochée depuis n'importe quel appareil. Next.js + Neon Postgres (via Vercel).

## Déploiement
1. Pousser ce dossier sur un repo GitHub.
2. Vercel → Add New Project → importer le repo.
3. Onglet Storage du projet → Create Database → Neon (Postgres) → connecter au projet. Cela ajoute `DATABASE_URL`.
4. (Conseillé) Settings → Environment Variables → `APP_PIN` = un code partagé avec ta fille.
5. Redéployer. La table est créée automatiquement au premier appel.

## Import depuis Excel
Exporter en CSV avec le numéro de Pokédex en première colonne, uniquement pour les cartes déjà obtenues, puis « Importer un CSV ».

## En local
`npm install`, créer `.env.local` avec `DATABASE_URL=...`, puis `npm run dev`.
