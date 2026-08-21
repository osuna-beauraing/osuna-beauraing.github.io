// Génère resultats.json à partir des réponses d'un Google Form (via le Google Sheet
// des réponses publié en CSV). Chaque équipe encode ses résultats (match première et
// match réserve) depuis un formulaire simple ; ce script convertit ces réponses au
// format attendu par la page Résultats du site.
//
// Lancé automatiquement par GitHub Actions (.github/workflows/update-resultats.yml),
// ou manuellement :  node scripts/import-resultats.mjs
// Pour tester en local sur un fichier :  node scripts/import-resultats.mjs chemin.csv sortie.json

import { writeFileSync, readFileSync } from "fs";

// ⚠️ À REMPLACER une fois le formulaire créé : l'URL "Publier sur le web → CSV"
// du Google Sheet des réponses (voir le guide de mise en place).
const URL_CSV_REPONSES =
  "https://docs.google.com/spreadsheets/d/CHANGER_ICI/pub?output=csv";

// Intitulés EXACTS attendus pour les questions du formulaire (comparés en ignorant
// accents/casse). Si tu renommes une question, mets à jour la valeur correspondante.
const CIBLES = {
  equipe:   "equipe",
  date:     "date du match",
  adversaire: "adversaire",
  lieu:     "lieu",
  coupe:    "match de coupe",
  p_osuna:  "premiere - sets osuna",
  p_adv:    "premiere - sets adversaire",
  p_detail: "premiere - detail des sets",
  r_osuna:  "reserve - sets osuna",
  r_adv:    "reserve - sets adversaire",
  r_detail: "reserve - detail des sets",
};

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function sansAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function norm(s) {
  return sansAccents(String(s)).toLowerCase().replace(/\s+/g, " ").replace(/[?*:]/g, "").trim();
}

// Découpe une ligne CSV en gérant les champs entre guillemets (les détails de sets
// contiennent des virgules, ex "25-20, 25-18").
function parserLigneCSV(ligne) {
  const champs = [];
  let cur = "", dans = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dans) {
      if (c === '"') {
        if (ligne[i + 1] === '"') { cur += '"'; i++; }
        else dans = false;
      } else cur += c;
    } else if (c === '"') dans = true;
    else if (c === ",") { champs.push(cur); cur = ""; }
    else cur += c;
  }
  champs.push(cur);
  return champs;
}

// Accepte "2026-09-05", "05/09/2026" ou "5/9/2026" -> "2026-09-05"
function dateISO(v) {
  v = v.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return null;
}

// Samedi du week-end contenant la date (dimanche -> samedi précédent ; sinon samedi de la semaine)
function samediDuWeekend(iso) {
  const d = new Date(iso + "T12:00:00");
  const jour = d.getDay(); // 0 dim .. 6 sam
  const delta = jour === 0 ? -1 : 6 - jour;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function labelWeekend(samediISO) {
  const sam = new Date(samediISO + "T12:00:00");
  const dim = new Date(sam); dim.setDate(sam.getDate() + 1);
  const jS = sam.getDate(), jD = dim.getDate();
  const mS = MOIS[sam.getMonth()], mD = MOIS[dim.getMonth()];
  const an = dim.getFullYear();
  return mS === mD ? `${jS}-${jD} ${mS} ${an}` : `${jS} ${mS} - ${jD} ${mD} ${an}`;
}

function intToScore(v) {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function construireMatch(type, equipe, adversaire, lieu, coupe, osuna, adv, detail) {
  const so = intToScore(osuna), sa = intToScore(adv);
  if (so === null || sa === null) return null; // pas de match de ce type
  return {
    equipe,
    type,                       // "Première" ou "Réserve"
    adversaire,
    lieu,                       // "domicile" / "exterieur"
    score_osuna: so,
    score_adversaire: sa,
    coupe,
    detail: (detail || "").trim(),
  };
}

async function chargerCSV(source) {
  if (source && (source.startsWith("http://") || source.startsWith("https://"))) {
    const r = await fetch(source, { cache: "no-store", redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status} en récupérant le CSV des réponses`);
    return await r.text();
  }
  // fichier local (test)
  return readFileSync(source, "utf-8");
}

async function main() {
  const source = process.argv[2] || URL_CSV_REPONSES;
  const sortie = process.argv[3] || new URL("../resultats.json", import.meta.url);

  const texte = await chargerCSV(source);
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lignes.length < 2) {
    console.log("Aucune réponse — resultats.json généré vide.");
    ecrire(sortie, []);
    return;
  }

  const entetes = parserLigneCSV(lignes[0]).map(norm);
  const idx = {};
  for (const [cle, cible] of Object.entries(CIBLES)) {
    idx[cle] = entetes.findIndex((h) => h === norm(cible));
    if (idx[cle] === -1) console.warn(`⚠ Colonne introuvable pour « ${cible} » (clé ${cle})`);
  }

  const get = (champs, cle) => (idx[cle] >= 0 ? (champs[idx[cle]] || "").trim() : "");

  // On parcourt dans l'ordre (les dernières réponses écrasent les précédentes pour un
  // même couple équipe+date+type : permet de corriger en re-soumettant le formulaire).
  const parCle = new Map();
  let nbLignes = 0, nbIgnorees = 0;

  for (let i = 1; i < lignes.length; i++) {
    const champs = parserLigneCSV(lignes[i]);
    const equipe = get(champs, "equipe");
    const dISO = dateISO(get(champs, "date"));
    const adversaire = get(champs, "adversaire");
    if (!equipe || !dISO || !adversaire) { nbIgnorees++; continue; }
    nbLignes++;

    const lieu = /ext/i.test(get(champs, "lieu")) ? "exterieur" : "domicile";
    const coupe = /oui/i.test(get(champs, "coupe"));

    const premiere = construireMatch("Première", equipe, adversaire, lieu, coupe,
      get(champs, "p_osuna"), get(champs, "p_adv"), get(champs, "p_detail"));
    const reserve = construireMatch("Réserve", equipe, adversaire, lieu, coupe,
      get(champs, "r_osuna"), get(champs, "r_adv"), get(champs, "r_detail"));

    for (const [type, match] of [["Première", premiere], ["Réserve", reserve]]) {
      if (!match) continue;
      const cle = `${dISO}|${norm(equipe)}|${type}`;
      parCle.set(cle, { dISO, match });
    }
  }

  // Regroupement par week-end
  const weekends = new Map();
  for (const { dISO, match } of parCle.values()) {
    const id = samediDuWeekend(dISO);
    if (!weekends.has(id)) weekends.set(id, { id, label: labelWeekend(id), matchs: [] });
    weekends.get(id).matchs.push(match);
  }

  const liste = [...weekends.values()].sort((a, b) => a.id.localeCompare(b.id));
  // Tri interne : par équipe puis Première avant Réserve
  const ordreType = { "Première": 0, "Réserve": 1 };
  for (const we of liste) {
    we.matchs.sort((a, b) =>
      a.equipe.localeCompare(b.equipe) || (ordreType[a.type] - ordreType[b.type]));
  }

  ecrire(sortie, liste);
  console.log(`✓ ${nbLignes} réponse(s) traitée(s)${nbIgnorees ? `, ${nbIgnorees} ignorée(s)` : ""} → ${liste.length} week-end(s), ${parCle.size} match(s).`);
}

function ecrire(sortie, weekends) {
  const donnees = {
    derniere_maj: new Date().toISOString().slice(0, 10),
    weekends,
  };
  writeFileSync(sortie, JSON.stringify(donnees, null, 2));
}

main().catch((e) => { console.error("Échec :", e.message); process.exit(1); });
