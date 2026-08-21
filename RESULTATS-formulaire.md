# Encodage des résultats par les équipes — mise en place

Objectif : chaque équipe encode ses résultats (match **première** + match **réserve**)
depuis un **Google Form** ultra-simple, sur son téléphone après le match. Les réponses
alimentent automatiquement la page **Résultats** du site (rien à télécharger, rien à
uploader sur GitHub).

Comment ça marche : Formulaire → Google Sheet des réponses (publié en CSV) →
le script `scripts/import-resultats.mjs` régénère `resultats.json` →
le workflow GitHub Actions le republie tout seul → la page Résultats s'actualise.

---

## 1. Créer le Google Form

Sur https://forms.google.com → « Formulaire vierge ». Titre : **Résultats — Osuna Volley Beauraing**.

Crée exactement ces questions (les intitulés doivent correspondre — la casse et les
accents n'ont pas d'importance, mais le reste du texte oui) :

| # | Intitulé exact de la question | Type | Obligatoire | Options / remarque |
|---|---|---|---|---|
| 1 | **Équipe** | Liste déroulante | Oui | Promotion Messieurs · Promotion Dames · P1 Messieurs · P2 Messieurs · P2 Dames · P4 Dames · U13 Filles |
| 2 | **Date du match** | Date | Oui | — |
| 3 | **Adversaire** | Réponse courte | Oui | ex. Floor F V.C. D |
| 4 | **Lieu** | Choix multiples | Oui | Domicile · Extérieur |
| 5 | **Match de coupe** | Choix multiples | Non | Non · Oui (laisser « Non » par défaut) |
| — | *(titre de section)* « Match première » | Section | — | — |
| 6 | **Première - sets Osuna** | Choix multiples | Oui | 0 · 1 · 2 · 3 |
| 7 | **Première - sets adversaire** | Choix multiples | Oui | 0 · 1 · 2 · 3 |
| 8 | **Première - détail des sets** | Réponse courte | Non | ex. 25-20, 25-18, 22-25, 25-19 |
| — | *(titre de section)* « Match réserve (si votre équipe en a un) » | Section | — | — |
| 9 | **Réserve - sets Osuna** | Choix multiples | Non | 0 · 1 · 2 · 3 |
| 10 | **Réserve - sets adversaire** | Choix multiples | Non | 0 · 1 · 2 · 3 |
| 11 | **Réserve - détail des sets** | Réponse courte | Non | ex. 25-22, 20-25, 15-10 |

> Astuce : pour les sets, un menu déroulant 0/1/2/3 évite les fautes de frappe.
> Si une équipe n'a pas de match réserve, elle laisse simplement les questions 9-11 vides.

## 2. Créer le Google Sheet des réponses

Dans le formulaire, onglet **Réponses** → icône Google Sheets (vert) → « Créer une feuille
de calcul ». Un classeur des réponses est créé, une ligne par soumission.

## 3. Publier ce Sheet en CSV

Dans le Sheet des réponses : **Fichier → Partager → Publier sur le web**.
- Choisir la feuille des réponses (« Réponses au formulaire 1 »).
- Format : **Valeurs séparées par des virgules (.csv)**.
- Cliquer **Publier**, confirmer, puis **copier l'URL** (elle finit par `output=csv`).

## 4. Brancher l'URL dans le script

Ouvrir `scripts/import-resultats.mjs` et remplacer, tout en haut, la valeur de
`URL_CSV_REPONSES` par l'URL copiée à l'étape 3. Enregistrer / committer sur GitHub.

## 5. Activer l'automatisation

- **Settings → Actions → General → Workflow permissions** : « Read and write permissions »
  (déjà activé pour les horaires — rien à refaire si c'est le cas).
- Le workflow `.github/workflows/update-resultats.yml` tourne alors tout seul chaque heure
  et republie `resultats.json` dès qu'il y a de nouvelles réponses. Tu peux aussi le lancer
  à la main : onglet **Actions → « Mise à jour des résultats » → Run workflow**.

## 6. Partager le formulaire aux équipes

Dans le formulaire : bouton **Envoyer → lien** (icône chaîne) → copier le lien (le raccourcir
avec « Raccourcir l'URL »). Partage-le aux responsables d'équipe (groupe WhatsApp, etc.).
Tu peux aussi générer un **QR code** de ce lien à afficher au vestiaire.

---

## Corriger un résultat déjà encodé

Il suffit de **re-soumettre le formulaire** avec la **même équipe et la même date** : la
nouvelle réponse remplace l'ancienne (le script garde toujours la dernière pour un couple
équipe + date + type de match).

## Tester le script en local (optionnel)

```
node scripts/import-resultats.mjs chemin/vers/reponses.csv sortie.json
```
(sans arguments, il utilise l'URL configurée et écrit `resultats.json`.)
