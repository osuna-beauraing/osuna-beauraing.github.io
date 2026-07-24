// Charge horaires.json (généré automatiquement par scripts/update-horaires.mjs)
// et alimente soit le panneau "prochain match" (index.html),
// soit le calendrier avec sélecteur d'équipe (horaires.html).

(function () {
  const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const MOIS = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sep.", "oct.", "nov.", "déc."];

  function formaterDate(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  }

  function estAujourdhui(iso) {
    const auj = new Date();
    const d = new Date(iso + "T00:00:00");
    return d.toDateString() === auj.toDateString();
  }

  function estPasse(iso) {
    const auj = new Date();
    auj.setHours(0, 0, 0, 0);
    return new Date(iso + "T00:00:00") < auj;
  }

  async function chargerDonnees() {
    const reponse = await fetch("horaires.json", { cache: "no-store" });
    if (!reponse.ok) throw new Error("horaires.json introuvable");
    return reponse.json();
  }

  // ---------- Page d'accueil : panneau "prochain match" ----------

  function initPanneauProchainMatch(donnees) {
    const panneau = document.getElementById("panneau-prochain-match");

    const tousLesMatchsAVenir = donnees.equipes
      .flatMap((eq) => eq.matchs.map((m) => ({ ...m, equipe: eq.nom })))
      .filter((m) => !estPasse(m.date))
      .sort((a, b) => `${a.date} ${a.heure || ""}`.localeCompare(`${b.date} ${b.heure || ""}`));

    if (tousLesMatchsAVenir.length === 0) {
      panneau.innerHTML = `
        <p class="panneau-eyebrow">Prochain match</p>
        <p style="grid-column:1/-1; margin:0; color:var(--creme-dim);">
          Aucun match à venir pour l'instant — le calendrier de la prochaine saison sera synchronisé automatiquement dès sa publication.
        </p>`;
      return;
    }

    const m = tousLesMatchsAVenir[0];
    const domicile = m.lieu === "domicile";
    const nousEt = domicile ? "Osuna Volley Beauraing" : m.adversaire;
    const euxEt = domicile ? m.adversaire : "Osuna Volley Beauraing";

    panneau.innerHTML = `
      <p class="panneau-eyebrow">Prochain match — ${m.equipe}</p>
      <div class="panneau-equipe">${nousEt}</div>
      <div class="panneau-vs">VS</div>
      <div class="panneau-equipe" style="text-align:right">${euxEt}</div>
      <div class="panneau-meta">
        <span><strong>Date</strong> — ${formaterDate(m.date)}${m.heure ? " à " + m.heure : ""}</span>
        <span><strong>Salle</strong> — ${m.salle || "à confirmer"}</span>
        <span><strong>Compétition</strong> — ${m.competition}</span>
      </div>`;
  }

  // ---------- Page horaires : sélecteur d'équipe + calendrier ----------

  function initPageHoraires(donnees) {
    const select = document.getElementById("selecteur-equipe");
    const corps = document.getElementById("corps-calendrier");
    const caption = document.getElementById("caption-calendrier");

    select.innerHTML = donnees.equipes
      .map((eq) => `<option value="${eq.id}">${eq.nom}</option>`)
      .join("");

    function rendreLigne(match) {
      const passe = estPasse(match.date);
      const aujourdhui = estAujourdhui(match.date);
      const cls = [passe ? "match-passe" : "", aujourdhui ? "match-jour" : ""].filter(Boolean).join(" ");
      const badgeCls = match.lieu === "domicile" ? "domicile" : "exterieur";
      const badgeTxt = match.lieu === "domicile" ? "Domicile" : "Extérieur";

      return `
        <tr class="${cls}">
          <td data-label="Date">${formaterDate(match.date)}</td>
          <td data-label="Heure">${match.heure || "—"}</td>
          <td data-label="Compétition">${match.competition || "—"}</td>
          <td data-label="Adversaire">${match.adversaire || "—"}</td>
          <td data-label="Lieu"><span class="badge ${badgeCls}">${badgeTxt}</span></td>
          <td data-label="Salle">${match.salle || "à confirmer"}</td>
        </tr>`;
    }

    function afficherEquipe(id) {
      const equipe = donnees.equipes.find((eq) => eq.id === id);
      if (!equipe) return;
      caption.textContent = equipe.nom;

      const matchs = equipe.matchs
        .filter((m) => !estPasse(m.date)) // sécurité : un match déjà joué ne s'affiche jamais
        .sort((a, b) => `${a.date} ${a.heure || ""}`.localeCompare(`${b.date} ${b.heure || ""}`));

      corps.innerHTML = matchs.length
        ? matchs.map(rendreLigne).join("")
        : `<tr><td colspan="6">Aucun match à venir pour cette équipe pour l'instant.</td></tr>`;
    }

    select.addEventListener("change", () => afficherEquipe(select.value));

    // Équipe par défaut : celle qui a le prochain match le plus proche
    const prochaine = donnees.equipes
      .flatMap((eq) => eq.matchs.map((m) => ({ id: eq.id, date: m.date })))
      .filter((m) => !estPasse(m.date))
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    const idParDefaut = prochaine ? prochaine.id : donnees.equipes[0]?.id;
    if (idParDefaut) {
      select.value = idParDefaut;
      afficherEquipe(idParDefaut);
    }
  }

  // ---------- Point d'entrée ----------

  async function demarrer() {
    const majInfo = document.getElementById("maj-info");
    try {
      const donnees = await chargerDonnees();

      if (majInfo) {
        majInfo.textContent = donnees.derniere_maj
          ? `Dernière synchronisation : ${formaterDate(donnees.derniere_maj)}`
          : "Dernière synchronisation inconnue";
      }

      if (document.getElementById("panneau-prochain-match")) {
        initPanneauProchainMatch(donnees);
      }
      if (document.getElementById("corps-calendrier")) {
        initPageHoraires(donnees);
      }
    } catch (err) {
      console.error(err);
      if (majInfo) majInfo.textContent = "Impossible de charger les horaires (horaires.json manquant ou invalide).";
      const panneau = document.getElementById("panneau-prochain-match");
      if (panneau) panneau.innerHTML = `<p class="panneau-eyebrow">Horaires indisponibles pour le moment</p>`;
      const corps = document.getElementById("corps-calendrier");
      if (corps) corps.innerHTML = `<tr><td colspan="6">Aucune donnée disponible.</td></tr>`;
    }
  }

  demarrer();
})();
