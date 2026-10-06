// Rafraîchit horaires.json à partir du portail OFFICIEL de la FVWB (portailfvwb.be).
// Lancé automatiquement par GitHub Actions (voir .github/workflows/update-horaires.yml).
//
// Fonctionnement PRUDENT (mise à jour « en place ») :
//  - met à jour l'HEURE des matchs de championnat à venir si elle a changé ;
//  - ajoute un match de championnat qui n'existait pas encore (ex. reprogrammation) ;
//  - ne touche JAMAIS aux salles/adresses déjà renseignées, ni aux matchs de coupe,
//    ni aux matchs déjà joués, et ne supprime jamais rien.
//
// Sécurité anti-écrasement : si le portail ne répond pas correctement (page
// inattendue, site en panne, structure modifiée), le script NE MODIFIE PAS
// horaires.json. L'ancien défaut (qui pouvait vider les horaires si la source
// tombait) est ainsi corrigé.
//
// Usage manuel : node scripts/update-horaires.mjs

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, "..");

// Jeton global de la vue "Résultats" du portail (liste aussi les matchs à venir avec l'heure).
// Service tiers : si plus rien ne se met à jour un jour, c'est probablement ce jeton à changer.
const PORTAIL_URL = (leagueId) =>
  `https://www.portailfvwb.be/matchs-275533v4/leagues/${leagueId}/seasons/220`;

// Une série (league) du portail = une de nos équipes premières (nom = champ "competition").
const LIGUES = [
  { league: 10790, equipe: "Promotion Dames" },
  { league: 10792, equipe: "Promotion Messieurs" },
  { league: 10799, equipe: "P1 Messieurs" },
  { league: 10805, equipe: "P2 Dames" },
  { league: 10809, equipe: "P2 Messieurs" },
  { league: 10823, equipe: "P4 Dames" },
];

function stripTags(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function iso(dateFr) {
  const [j, m, a] = dateFr.split(".");
  return `${a}-${m}-${j}`;
}

// Extrait d'une page de série : le nombre de matchs Beauraing repérés (joués ou non,
// pour valider que la page a chargé) et la liste des matchs Beauraing À VENIR
// (ceux affichés avec une heure ou "- : -", donc pas encore joués).
export function parserHoraires(html) {
  const anchors = [...html.matchAll(/<a\b[^>]*href="[^"]*\/games\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g)];
  let totalBeauraing = 0;
  const aVenir = [];

  for (const a of anchors) {
    const texte = stripTags(a[2]);
    if (/Beauraing/i.test(texte)) totalBeauraing++;

    // Match à venir : "<ÉquipeA> (Seniors X) <HH:MM ou - : -> <JJ.MM.AAAA> <ÉquipeB> (Seniors X)"
    const m = texte.match(
      /^(.+?\(Seniors [MF]\))\s*(\d{1,2}:\d{2}|-\s*:\s*-)\s*(\d{2}\.\d{2}\.\d{4})\s*(.+\(Seniors [MF]\))\s*$/
    );
    if (!m) continue;

    const home = m[1].trim();
    const heureBrute = m[2].trim();
    const dateFr = m[3];
    const away = m[4].trim();

    const homeBea = /Beauraing/i.test(home);
    const awayBea = /Beauraing/i.test(away);
    if (!homeBea && !awayBea) continue;

    const adversaireBrut = homeBea ? away : home;
    const adversaire = adversaireBrut.replace(/\s*\(Seniors [MF]\)\s*$/, "").trim();
    const heure = /^\d{1,2}:\d{2}$/.test(heureBrute) ? heureBrute : null;

    aVenir.push({
      date: iso(dateFr),
      heure,
      lieu: homeBea ? "domicile" : "exterieur",
      adversaire,
    });
  }

  return { totalBeauraing, aVenir };
}

// Applique les matchs à venir du portail sur les matchs d'une équipe, en place.
export function majEquipe(equipeObj, aVenir) {
  if (!Array.isArray(equipeObj.matchs)) equipeObj.matchs = [];
  for (const p of aVenir) {
    // On ne considère que le championnat (pas la coupe) pour cette équipe.
    const existant = equipeObj.matchs.find(
      (m) => m.coupe !== true && m.date === p.date
    );
    if (existant) {
      // Ne mettre à jour l'heure que si le portail en donne une vraie (sinon garder l'existante).
      if (p.heure) existant.heure = p.heure;
    } else {
      // Match absent (reprogrammation / nouvelle date) : on l'ajoute, sans salle connue.
      equipeObj.matchs.push({
        competition: equipeObj.nom,
        date: p.date,
        heure: p.heure,
        adversaire: p.adversaire,
        lieu: p.lieu,
        salle: null,
        adresse: null,
        coupe: false,
      });
    }
  }
  equipeObj.matchs.sort((a, b) =>
    `${a.date} ${a.heure || "99:99"}`.localeCompare(`${b.date} ${b.heure || "99:99"}`)
  );
}

async function main() {
  const parEquipe = new Map(); // nom équipe -> aVenir[]
  let toutesLiguesOK = true;

  for (const { league, equipe } of LIGUES) {
    try {
      const res = await fetch(PORTAIL_URL(league), {
        headers: { "User-Agent": "osuna-beauraing-site/1.0 (horaires)" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const html = await res.text();
      const { totalBeauraing, aVenir } = parserHoraires(html);

      if (totalBeauraing === 0) {
        console.error(`✗ ${equipe} (série ${league}) : aucun match Beauraing repéré — page inattendue. On n'écrase rien.`);
        toutesLiguesOK = false;
        continue;
      }
      parEquipe.set(equipe, aVenir);
      console.log(`✓ ${equipe} : ${aVenir.length} match(s) à venir lus (${totalBeauraing} au total)`);
    } catch (e) {
      console.error(`✗ ${equipe} (série ${league}) :`, e.message);
      toutesLiguesOK = false;
    }
  }

  if (!toutesLiguesOK) {
    console.error("Lecture du portail incomplète → horaires.json laissé inchangé (sécurité anti-écrasement).");
    return;
  }

  const fichier = path.join(RACINE, "horaires.json");
  const data = JSON.parse(readFileSync(fichier, "utf-8"));

  for (const equipeObj of data.equipes) {
    const aVenir = parEquipe.get(equipeObj.nom);
    if (aVenir) majEquipe(equipeObj, aVenir);
  }

  data.derniere_maj = new Date().toISOString().slice(0, 10);
  writeFileSync(fichier, JSON.stringify(data, null, 2) + "\n");
  console.log("horaires.json mis à jour.");
}

if (process.argv[1] && process.argv[1].endsWith("update-horaires.mjs")) {
  main().catch((e) => {
    console.error("Échec:", e);
    process.exit(1);
  });
}
