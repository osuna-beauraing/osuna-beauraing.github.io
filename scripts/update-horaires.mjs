// Récupère les horaires de toutes les équipes du club depuis easyscore.be
// (miroir public des données de la FVWB) et génère horaires.json.
//
// Lancé automatiquement par GitHub Actions (voir .github/workflows/update-horaires.yml),
// ou manuellement avec : node scripts/update-horaires.mjs

import { writeFileSync } from "fs";

const CLUB_SLUG = "osuna-volley-beauraing";
const CLUB_NOM = "Osuna Volley Beauraing";

// Pour ajouter / retirer une équipe : modifie cette liste.
// Le "team_id" se trouve sur https://easyscore.be/club/osuna-volley-beauraing/teams
// Noms à jour pour la saison 2026-2027 (montées de division) :
//  - l'ex-P3 Dames devient P2 Dames
//  - l'ex-P2 Messieurs devient P1 Messieurs
//  - l'ex-P3 Messieurs devient P2 Messieurs
// Le "team_id" ne change pas d'une saison à l'autre : seule l'étiquette
// affichée sur le site est à corriger ici. Le nom réel de la série
// (tel que publié par la fédération) est repris automatiquement dans
// le champ "competition" de chaque match, sans rien coder en dur.
const EQUIPES = [
  { id: "prom-h", nom: "Promotion Messieurs", team_id: 306672 },
  { id: "prom-d", nom: "Promotion Dames", team_id: 309326 },
  { id: "p1-h", nom: "P1 Messieurs", team_id: 312389 },
  { id: "p2-h", nom: "P2 Messieurs", team_id: 317669 },
  { id: "p2-d", nom: "P2 Dames", team_id: 315029 },
  { id: "p4-d", nom: "P4 Dames", team_id: 317999 },
  { id: "u13-d", nom: "U13 Filles", team_id: 310646 },
];

// Découpe une ligne CSV en tenant compte des champs entre guillemets
// (nécessaire car l'adresse contient parfois des virgules).
function parserLigneCSV(ligne) {
  const champs = [];
  let cur = "";
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === ",") {
      champs.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  champs.push(cur);
  return champs;
}

function dateEnISO(ddmmyyyy) {
  const [j, m, a] = ddmmyyyy.split("/");
  return `${a}-${m}-${j}`;
}

async function recupererMatchsEquipe(teamId) {
  const url = `https://easyscore.be/club/${CLUB_SLUG}/team/${teamId}/games.csv`;
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} pour l'équipe ${teamId}`);

  const texte = await reponse.text();
  const lignes = texte.split("\n").map((l) => l.trim()).filter(Boolean);
  const [, ...rangees] = lignes; // on ignore l'en-tête
  const aujourdhuiISO = new Date().toISOString().slice(0, 10);

  return rangees
    .map((ligne) => {
      const [competition, domicile, visiteur, date, heure, salle, adresse, matchId] =
        parserLigneCSV(ligne);
      if (!date) return null;

      const estDomicile = domicile.includes("Osuna");
      const adversaireBrut = estDomicile ? visiteur : domicile;
      const adresseValide = adresse && adresse.trim() !== ", 0" ? adresse.trim() : null;

      return {
        competition,
        date: dateEnISO(date),
        heure: heure && heure !== "00:00" ? heure : null,
        adversaire: adversaireBrut.replace(/\s*\(\s*Dro\s*\)\s*/gi, "").trim(),
        lieu: estDomicile ? "domicile" : "exterieur",
        salle: salle || null,
        adresse: adresseValide,
        match_id: matchId ? matchId.trim() : null,
      };
    })
    .filter(Boolean)
    // On ne garde que les matchs à venir (aujourd'hui inclus) : les matchs déjà
    // joués, notamment ceux d'une saison précédente encore présents dans le flux,
    // ne doivent pas s'afficher sur le site.
    .filter((m) => m.date >= aujourdhuiISO)
    .sort((a, b) => `${a.date} ${a.heure || ""}`.localeCompare(`${b.date} ${b.heure || ""}`));
}

async function main() {
  const equipes = [];

  for (const equipe of EQUIPES) {
    try {
      const matchs = await recupererMatchsEquipe(equipe.team_id);
      equipes.push({ ...equipe, matchs });
      console.log(`✓ ${equipe.nom} : ${matchs.length} match(s)`);
    } catch (err) {
      console.error(`✗ ${equipe.nom} (team ${equipe.team_id}) :`, err.message);
      // On garde l'équipe avec une liste vide plutôt que de faire échouer tout le script
      equipes.push({ ...equipe, matchs: [] });
    }
  }

  const donnees = {
    derniere_maj: new Date().toISOString().slice(0, 10),
    club: CLUB_NOM,
    equipes,
  };

  writeFileSync(new URL("../horaires.json", import.meta.url), JSON.stringify(donnees, null, 2));
  console.log("horaires.json généré avec succès.");
}

main().catch((err) => {
  console.error("Échec du script :", err);
  process.exit(1);
});
