# Site du club — Osuna Volley Beauraing

## Ce que contient ce dossier

- `index.html` — page d'actualités, avec le panneau du prochain match (toutes équipes confondues)
- `horaires.html` — calendrier des matchs, avec un sélecteur pour choisir l'équipe
- `style.css` — tout le style visuel du site
- `script.js` — affiche les horaires à partir de `horaires.json`
- `horaires.json` — les données des matchs (générées automatiquement — voir plus bas)
- `scripts/update-horaires.mjs` — le script qui va chercher les horaires en ligne
- `.github/workflows/update-horaires.yml` — l'automatisation qui exécute ce script tous les jours

## Comment marche la synchronisation automatique

Le portail officiel de la FVWB est pénible à interroger directement (connexion requise, contenu chargé en JavaScript). En revanche, il existe un site miroir public, **easyscore.be**, qui republie les mêmes données de façon bien plus simple : chaque équipe du club y a une page avec un **export CSV** téléchargeable librement, qui reflète en temps réel le portail officiel.

Le club Osuna Volley Beauraing a 7 équipes, chacune avec son propre identifiant sur easyscore.be :

| Équipe (2026-2027) | Identifiant | Remarque |
|---|---|---|
| Promotion Messieurs | 306672 | |
| Promotion Dames | 309326 | |
| P1 Messieurs | 312389 | monte de P2 |
| P2 Messieurs | 317669 | monte de P3 |
| P2 Dames | 315029 | monte de P3 |
| P4 Dames | 317999 | |
| U13 Filles | 310646 | |

L'identifiant (`team_id`) ne change pas quand une équipe monte de division — c'est toujours la même équipe, juste dans une série différente. Seul le nom affiché sur le site a été mis à jour à la main pour refléter la montée ; le nom exact de la série que joue l'équipe (ex. "Provinciale 1 Messieurs") vient automatiquement du calendrier officiel dès qu'il est publié, sans qu'on ait à y toucher.

**Vérifié le 09/07/2026** : le calendrier 2026-2027 n'est pas encore publié par la fédération, ni sur le portail officiel ni sur easyscore.be — c'est normal, ça sort généralement fin août / début septembre. Dès qu'il sera en ligne, la synchronisation quotidienne le récupérera automatiquement.

Le script `scripts/update-horaires.mjs` télécharge le CSV de chacune de ces équipes, en extrait les matchs (adversaire, date, heure, salle, domicile/extérieur), et régénère `horaires.json`. Le workflow GitHub Actions (`update-horaires.yml`) exécute ce script **automatiquement une fois par jour** et republie le fichier — le site se met donc à jour tout seul, sans aucune action de ta part.

**Important pour cet été** : la saison 2025-2026 est terminée et celle de 2026-2027 n'est pas encore publiée par la fédération (généralement fin août / début septembre). `horaires.json` contient donc pour l'instant des matchs de la saison écoulée, à titre d'exemple. Dès que le nouveau calendrier sera en ligne sur le portail, la synchronisation quotidienne le récupérera automatiquement — tu n'as rien à faire.

### Ajouter, retirer ou corriger une équipe

Ouvre `scripts/update-horaires.mjs` et modifie la liste `EQUIPES` en haut du fichier. Pour trouver l'identifiant d'une équipe (par exemple si une nouvelle équipe est créée la saison prochaine), va sur :
`https://easyscore.be/club/osuna-volley-beauraing/teams`
— chaque équipe y a un lien du type `.../team/123456`, le nombre à la fin est l'identifiant à utiliser.

### Mettre en place l'automatisation sur GitHub

Une fois le dépôt créé sur GitHub (voir section 3 plus bas) :

1. Va dans **Settings → Actions → General** de ton dépôt.
2. Dans "Workflow permissions", sélectionne **"Read and write permissions"** et sauvegarde. (Sans ça, le script ne pourra pas republier `horaires.json` automatiquement.)
3. Le workflow tourne ensuite tout seul chaque jour. Tu peux aussi le déclencher manuellement : onglet **Actions** du dépôt → "Mise à jour des horaires" → "Run workflow".

### Bonus : chaque membre peut aussi s'abonner directement à son équipe

Indépendamment du site, easyscore.be propose un flux calendrier (.ics) par équipe, que n'importe qui peut ajouter à Google Calendar / Apple Calendrier / Outlook pour voir les matchs de son équipe apparaître automatiquement dans son agenda perso, par exemple :
`https://easyscore.be/club/osuna-volley-beauraing/team/306672/games.ics` (Promotion Messieurs)

Pratique à partager aux joueurs et parents en complément du site.

## Actualités automatiques (Facebook)

La page d'accueil intègre le **plugin Page officiel de Meta**, qui affiche en direct les vrais posts de la page Facebook du club (`facebook.com/OsunaVolleyBeauraing`). C'est la méthode légitime pour ça — Facebook bloque le scraping automatisé, donc on ne peut pas (et on ne doit pas) aller lire le contenu autrement. Ce plugin :

- se met à jour tout seul dès qu'un post est publié sur la page Facebook — rien à faire côté site
- ne nécessite ni clé API ni compte développeur, juste le lien public de la page
- peut, selon les réglages de confidentialité de Facebook, afficher un léger "Se connecter pour voir plus" aux visiteurs non connectés à Facebook — c'est une limite imposée par Facebook, pas quelque chose qu'on peut ajuster depuis le site

Si tu veux changer la taille du cadre, modifie `data-width` / `data-height` sur le bloc `<div class="fb-page">` dans `index.html`.

Une section "Autres annonces" reste disponible juste en dessous pour les infos qui ne passent pas par Facebook (blocs `<article class="actu-carte">`).

## Le logo

Le logo est maintenant intégré **directement dans le code** de `index.html` et `horaires.html` (technique "image encodée en base64") plutôt que chargé depuis un fichier séparé. Ça évite les soucis d'upload où le fichier `assets/logo.jpg` ne suivait pas correctement sur GitHub. Le fichier `assets/logo.jpg` reste présent dans ce dossier à titre de sauvegarde de l'original, mais le site ne dépend plus de lui.

Si tu veux un jour changer le logo, envoie-moi la nouvelle image et je regénère les fichiers HTML avec la nouvelle version intégrée de la même façon.

## 1. Personnaliser le contenu

- **Couleurs** : tout est piloté par des variables en haut de `style.css` (`--marine-800`, `--ambre`, etc.).
- **Actualités** : dans `index.html`, chaque actu est un bloc `<article class="actu-carte">…</article>`. Copie/colle ce bloc pour en ajouter une.
- **Horaires** : ne pas éditer à la main — ils sont régénérés automatiquement. Si un horaire affiché est faux, c'est une erreur du portail fédéral lui-même à faire corriger par la fédération.

## 2. Voir le site en local

Ouvre `index.html` dans ton navigateur, ou lance un petit serveur (`python3 -m http.server` dans ce dossier) si le chargement de `horaires.json` ne fonctionne pas directement en local.

## 3. Mettre le site en ligne gratuitement (GitHub Pages)

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Crée un nouveau dépôt (repository), par exemple `site-club`.
3. Mets tous les fichiers de ce dossier dedans (interface web "Add file → Upload files", en incluant bien le dossier caché `.github`).
4. **Settings → Actions → General** : active "Read and write permissions" (voir plus haut).
5. **Settings → Pages → Source** : "Deploy from a branch", branche `main`, dossier `/ (root)`.
6. Le site est en ligne après une minute, à une adresse du type `https://tonpseudo.github.io/site-club/`.

Gratuit, sans limite pratique pour ce genre de site.
