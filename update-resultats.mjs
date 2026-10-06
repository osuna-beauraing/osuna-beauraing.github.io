// Régénère resultats.json à partir du portail OFFICIEL de la FVWB (portailfvwb.be).
// Lancé automatiquement par GitHub Actions (voir .github/workflows/update-resultats.yml),
// prévu chaque dimanche soir. Ne concerne que les matchs PREMIÈRES (championnat).
//
// Sécurité importante : si le portail ne répond pas correctement (page inattendue,
// site en panne, structure modifiée), le script NE MODIFIE PAS resultats.json.
// Il ne peut donc jamais effacer des résultats déjà en ligne par accident.
//
// Usage manuel : node scripts/update-resultats.mjs

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, "..");

// Jeton global de la vue "Résultats" du portail (identique pour toutes les séries).
// C'est un service tiers : si un jour plus rien ne se met à jour, c'est très
// probablement ce jeton qui a changé — il suffit de le remplacer ici.
const RESULTATS_URL = (leagueId) =>
  `https://www.portailfvwb.be/matchs-275533v4/leagues/${leagueId}/seasons/220`;

// Une série (league) du portail = une de nos équipes premières.
const LIGUES = [
  { league: 10790, equipe: "Promotion Dames" },
  { league: 10792, equipe: "Promotion Messieurs" },
  { league: 10799, equipe: "P1 Messieurs" },
  { league: 10805, equipe: "P2 Dames" },
  { league: 10809, equipe: "P2 Messieurs" },
  { league: 10823, equipe: "P4 Dames" },
];

const ORDRE_EQUIPES = LIGUES.map((l) => l.equipe);
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function stripTags(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function iso(dateFr) {
  const [j, m, a] = dateFr.split(".");
  return `${a}-${m}-${j}`;
}

// Samedi du week-end d'une date donnée (on regroupe sam+dim, et un match du
// vendredi est rattaché au samedi suivant).
function samediDuWeekend(isoDate) {
  const d = new Date(isoDate + "T00:00:00Z");
  const jour = d.getUTCDay(); // 0=dim ... 6=sam
  let delta;
  if (jour === 6) delta = 0;
  else if (jour === 0) delta = -1;
  else if (jour === 5) delta = 1;
  else delta = 6 - jour;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function labelWeekend(samediIso) {
  const sam = new Date(samediIso + "T00:00:00Z");
  const dim = new Date(sam);
  dim.setUTCDate(sam.getUTCDate() + 1);
  const jSam = sam.getUTCDate(), jDim = dim.getUTCDate();
  if (sam.getUTCMonth() === dim.getUTCMonth())
    return `${jSam}-${jDim} ${MOIS[sam.getUTCMonth()]} ${sam.getUTCFullYear()}`;
  return `${jSam} ${MOIS[sam.getUTCMonth()]} - ${jDim} ${MOIS[dim.getUTCMonth()]} ${sam.getUTCFullYear()}`;
}

// Extrait d'une page de résultats de série : le nombre de matchs Beauraing repérés
// (joués ou non — sert à vérifier que la page a bien chargé) et la liste des
// matchs de Beauraing AVEC un score (donc joués).
export function parserPage(html, equipeNom) {
  const anchors = [...html.matchAll(/<a\b[^>]*href="[^"]*\/games\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g)];
  let totalBeauraing = 0;
  const joues = [];

  for (const a of anchors) {
    const texte = stripTags(a[2]);
    if (/Beauraing/i.test(texte)) totalBeauraing++;

    // Match joué : "<ÉquipeA> (Seniors X) <s1> - <s2> <JJ.MM.AAAA> <ÉquipeB> (Seniors X)"
    const m = texte.match(
      /^(.+?\(Seniors [MF]\))\s*(\d{1,2})\s*-\s*(\d{1,2})\s*(\d{2}\.\d{2}\.\d{4})\s*(.+\(Seniors [MF]\))\s*$/
    );
    if (!m) continue;

    const home = m[1].trim();
    const s1 = parseInt(m[2], 10);
    const s2 = parseInt(m[3], 10);
    const dateFr = m[4];
    const away = m[5].trim();

    const homeBea = /Beauraing/i.test(home);
    const awayBea = /Beauraing/i.test(away);
    if (!homeBea && !awayBea) continue;

    const adversaireBrut = homeBea ? away : home;
    const adversaire = adversaireBrut.replace(/\s*\(Seniors [MF]\)\s*$/, "").trim();

    joues.push({
      equipe: equipeNom,
      adversaire,
      lieu: homeBea ? "domicile" : "exterieur",
      score_osuna: homeBea ? s1 : s2,
      score_adversaire: homeBea ? s2 : s1,
      coupe: false,
      date: iso(dateFr),
    });
  }

  return { totalBeauraing, joues };
}

async function main() {
  const resultatsPortail = []; // { wid, match }
  let toutesLiguesOK = true;

  for (const { league, equipe } of LIGUES) {
    try {
      const res = await fetch(RESULTATS_URL(league), {
        headers: { "User-Agent": "osuna-beauraing-site/1.0 (resultats)" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const html = await res.text();
      const { totalBeauraing, joues } = parserPage(html, equipe);

      if (totalBeauraing === 0) {
        console.error(`✗ ${equipe} (série ${league}) : aucun match Beauraing repéré — page inattendue. On n'écrase rien.`);
        toutesLiguesOK = false;
        continue;
      }

      for (const j of joues) {
        resultatsPortail.push({
          wid: samediDuWeekend(j.date),
          match: {
            equipe: j.equipe,
            adversaire: j.adversaire,
            lieu: j.lieu,
            score_osuna: j.score_osuna,
            score_adversaire: j.score_adversaire,
            coupe: false,
          },
        });
      }
      console.log(`✓ ${equipe} : ${joues.length} résultat(s) joué(s) sur ${totalBeauraing} match(s)`);
    } catch (e) {
      console.error(`✗ ${equipe} (série ${league}) :`, e.message);
      toutesLiguesOK = false;
    }
  }

  if (!toutesLiguesOK) {
    console.error("Lecture du portail incomplète → resultats.json laissé inchangé (sécurité anti-écrasement).");
    return; // on ne touche à rien
  }

  const fichier = path.join(RACINE, "resultats.json");
  const data = JSON.parse(readFileSync(fichier, "utf-8"));
  fusionner(data, resultatsPortail);
  data.derniere_maj = new Date().toISOString().slice(0, 10);
  writeFileSync(fichier, JSON.stringify(data, null, 2) + "\n");
  console.log("resultats.json mis à jour.");
}

// Fusionne les résultats du portail dans la structure existante :
// - conserve tous les week-ends déjà listés (et leurs libellés),
// - remplace le résultat championnat d'une équipe pour un week-end donné,
// - conserve un éventuel match de coupe encodé à la main (coupe: true),
// - trie l'affichage (victoires d'abord) et les week-ends par ordre chronologique.
export function fusionner(data, resultatsPortail) {
  if (!Array.isArray(data.weekends)) data.weekends = [];
  const parId = new Map(data.weekends.map((w) => [w.id, w]));

  for (const { wid, match } of resultatsPortail) {
    let w = parId.get(wid);
    if (!w) {
      w = { id: wid, label: labelWeekend(wid), matchs: [] };
      parId.set(wid, w);
      data.weekends.push(w);
    }
    if (!Array.isArray(w.matchs)) w.matchs = [];
    w.matchs = w.matchs.filter((m) => m.equipe !== match.equipe || m.coupe === true);
    w.matchs.push(match);
  }

  const rang = (e) => {
    const i = ORDRE_EQUIPES.indexOf(e);
    return i === -1 ? 99 : i;
  };
  for (const w of data.weekends) {
    if (!Array.isArray(w.matchs)) continue;
    w.matchs.sort((a, b) => {
      const va = a.score_osuna > a.score_adversaire ? 0 : 1;
      const vb = b.score_osuna > b.score_adversaire ? 0 : 1;
      if (va !== vb) return va - vb;
      return rang(a.equipe) - rang(b.equipe);
    });
  }

  data.weekends.sort((a, b) => a.id.localeCompare(b.id));
  delete data._note;
  return data;
}

// N'exécute main() que lorsqu'on lance directement le script (pas à l'import pour les tests).
if (process.argv[1] && process.argv[1].endsWith("update-resultats.mjs")) {
  main().catch((e) => {
    console.error("Échec:", e);
    process.exit(1);
  });
}
