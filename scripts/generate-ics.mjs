// Génère un fichier .ics (calendrier iCalendar) par équipe à partir de horaires.json.
// Ces fichiers permettent à n'importe qui de s'ABONNER (pas juste importer une fois)
// au calendrier d'une équipe depuis Google Calendar, Apple Calendrier, Outlook, etc.
// Comme l'abonnement pointe vers ce fichier hébergé sur le site, toute mise à jour
// de horaires.json (nouvelle date, salle corrigée...) se répercute automatiquement
// dans le calendrier de la personne abonnée, à son prochain rafraîchissement
// (les applications de calendrier vérifient en général une fois par jour).
//
// Usage : node scripts/generate-ics.mjs
// (appelé automatiquement après update-horaires.mjs dans le workflow GitHub Actions)

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, "..");

const VTIMEZONE_BRUXELLES = `BEGIN:VTIMEZONE
TZID:Europe/Brussels
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

// Échappement des caractères spéciaux requis par la norme iCalendar (RFC 5545)
function echapper(texte) {
  return String(texte)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Les lignes iCalendar ne doivent pas dépasser 75 octets ; on replie les plus longues.
function plier(ligne) {
  if (ligne.length <= 75) return ligne;
  let resultat = "";
  let reste = ligne;
  while (reste.length > 75) {
    resultat += reste.slice(0, 75) + "\r\n ";
    reste = reste.slice(75);
  }
  return resultat + reste;
}

function horodatageUTC(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function construireEvenement(match, club, equipeNom) {
  const domicile = match.lieu === "domicile";
  const nousEt = "Osuna Volley Beauraing";
  const adversaire = match.adversaire || "Adversaire à confirmer";
  const titre = domicile ? `${nousEt} - ${adversaire}` : `${adversaire} - ${nousEt}`;

  const salle = match.salle || "Salle à confirmer";
  const adresse = match.adresse ? `, ${match.adresse}` : "";
  const lieuTexte = `${salle}${adresse}`;

  const descriptionLignes = [
    `Équipe : ${equipeNom}`,
    match.coupe ? "Match de coupe provinciale" : null,
    domicile ? "Match à domicile" : "Match à l'extérieur",
    !match.heure || match.heure === "?" ? "Heure encore à confirmer par la fédération" : null,
  ].filter(Boolean);

  const uid = `${match.match_id || `${equipeNom}-${match.date}-${adversaire}`}@osuna-beauraing.github.io`
    .replace(/\s+/g, "-");

  const [annee, mois, jour] = match.date.split("-");
  const heureConnue = match.heure && /^\d{2}:\d{2}$/.test(match.heure);

  let ligneDebut, ligneFin;
  if (heureConnue) {
    const [h, min] = match.heure.split(":");
    ligneDebut = `DTSTART;TZID=Europe/Brussels:${annee}${mois}${jour}T${h}${min}00`;
    // Durée estimée d'un match de volley : 2h
    const finHeure = (parseInt(h, 10) + 2) % 24;
    ligneFin = `DTEND;TZID=Europe/Brussels:${annee}${mois}${jour}T${String(finHeure).padStart(2, "0")}${min}00`;
  } else {
    // Heure inconnue -> événement "journée entière" pour ne pas afficher une heure fausse
    ligneDebut = `DTSTART;VALUE=DATE:${annee}${mois}${jour}`;
    ligneFin = `DTEND;VALUE=DATE:${annee}${mois}${jour}`;
  }

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${horodatageUTC(new Date())}`,
    ligneDebut,
    ligneFin,
    `SUMMARY:${echapper(titre)}`,
    `LOCATION:${echapper(lieuTexte)}`,
    `DESCRIPTION:${echapper(descriptionLignes.join("\n"))}`,
    "END:VEVENT",
  ]
    .map(plier)
    .join("\r\n");
}

function construireCalendrier(equipe, club) {
  const evenements = equipe.matchs.map((m) => construireEvenement(m, club, equipe.nom)).join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Osuna Volley Beauraing//Calendrier des matchs//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${echapper(`${club} - ${equipe.nom}`)}`,
    `X-WR-TIMEZONE:Europe/Brussels`,
    VTIMEZONE_BRUXELLES.replace(/\n/g, "\r\n"),
    evenements,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

// Lecture de horaires.json et génération d'un fichier .ics par équipe
const horaires = JSON.parse(readFileSync(path.join(RACINE, "horaires.json"), "utf-8"));

const dossierIcs = path.join(RACINE, "ics");
mkdirSync(dossierIcs, { recursive: true });

for (const equipe of horaires.equipes) {
  const contenu = construireCalendrier(equipe, horaires.club);
  writeFileSync(path.join(dossierIcs, `${equipe.id}.ics`), contenu + "\r\n");
  console.log(`✓ ics/${equipe.id}.ics généré (${equipe.matchs.length} match(s))`);
}

console.log("Génération des calendriers .ics terminée.");
