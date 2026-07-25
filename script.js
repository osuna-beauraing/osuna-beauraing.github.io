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

  async function chargerJSON(nomFichier) {
    const reponse = await fetch(nomFichier, { cache: "no-store" });
    if (!reponse.ok) throw new Error(`${nomFichier} introuvable`);
    return reponse.json();
  }

  // ---------- Page d'accueil : panneau "prochain match" ----------

  function initPanneauProchainMatch(donnees) {
    const panneau = document.getElementById("panneau-prochain-match");

    const tousLesMatchsAVenir = donnees.equipes
      .flatMap((eq) => eq.matchs.map((m) => ({ ...m, equipe: eq.nom })))
      .filter((m) => !estPasse(m.date))
      .sort((a, b) => `${a.date} ${a.heure || "99:99"}`.localeCompare(`${b.date} ${b.heure || "99:99"}`));

    if (tousLesMatchsAVenir.length === 0) {
      panneau.innerHTML = `
        <p class="panneau-titre-prochain">Prochains matchs</p>
        <p style="margin:0; color:var(--creme-dim);">
          Aucun match à venir pour l'instant — le calendrier de la prochaine saison sera synchronisé automatiquement dès sa publication.
        </p>`;
      return;
    }

    // On prend TOUS les matchs de la date la plus proche, toutes équipes confondues
    // (il peut y en avoir plusieurs le même jour), pas seulement le tout premier.
    const prochaineDate = tousLesMatchsAVenir[0].date;
    const matchsDuJour = tousLesMatchsAVenir
      .filter((m) => m.date === prochaineDate)
      .sort((a, b) => (a.heure || "99:99").localeCompare(b.heure || "99:99"));

    const lignes = matchsDuJour
      .map((m) => {
        const domicile = m.lieu === "domicile";
        const nousEt = domicile ? "Osuna Volley Beauraing" : m.adversaire;
        const euxEt = domicile ? m.adversaire : "Osuna Volley Beauraing";
        const badgeCls = domicile ? "domicile" : "exterieur";
        const badgeTxt = domicile ? "🏠 Domicile" : "🚌 Extérieur";

        return `
          <div class="panneau-match-row">
            <p class="panneau-match-equipe">${m.equipe}${m.coupe ? " · Coupe" : ""}</p>
            <div class="panneau-match-versus">${nousEt}<span class="panneau-vs-mini">vs</span>${euxEt}</div>
            <div class="panneau-match-meta">
              <span>${m.heure || "heure à confirmer"}</span>
              <span class="badge ${badgeCls}">${badgeTxt}</span>
              <span>${m.salle || "salle à confirmer"}</span>
            </div>
          </div>`;
      })
      .join("");

    panneau.innerHTML = `
      <p class="panneau-titre-prochain">Prochains matchs — ${formaterDate(prochaineDate)}</p>
      <div class="panneau-match-liste">${lignes}</div>`;
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
      const domicile = match.lieu === "domicile";
      const cls = [passe ? "match-passe" : "", aujourdhui ? "match-jour" : "", domicile ? "match-domicile" : ""]
        .filter(Boolean)
        .join(" ");
      const badgeCls = domicile ? "domicile" : "exterieur";
      const badgeTxt = domicile ? "🏠 Domicile" : "🚌 Extérieur";

      return `
        <tr class="${cls}">
          <td data-label="Date">${formaterDate(match.date)}</td>
          <td data-label="Heure">${match.heure || "—"}</td>
          <td data-label="Équipe">${match.competition || "—"}</td>
          <td data-label="Coupe">${match.coupe ? '<span class="badge coupe">Coupe</span>' : ""}</td>
          <td data-label="Adversaire">${match.adversaire || "—"}</td>
          <td data-label="Lieu"><span class="badge ${badgeCls}">${badgeTxt}</span></td>
          <td data-label="Salle">${match.salle || "à confirmer"}</td>
        </tr>`;
    }

    function afficherEquipe(id) {
      const equipe = donnees.equipes.find((eq) => eq.id === id);
      if (!equipe) return;
      caption.textContent = equipe.nom;

      // Liens d'abonnement au calendrier de cette équipe (mis à jour à chaque changement)
      const urlIcsHttps = `https://osuna-beauraing.github.io/ics/${equipe.id}.ics`;
      const urlIcsWebcal = urlIcsHttps.replace(/^https:\/\//, "webcal://");
      const lienGoogle = document.getElementById("lien-google-agenda");
      const lienWebcal = document.getElementById("lien-webcal");
      if (lienGoogle) lienGoogle.href = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(urlIcsHttps)}`;
      if (lienWebcal) lienWebcal.href = urlIcsWebcal;

      const matchs = equipe.matchs
        .filter((m) => !estPasse(m.date)) // sécurité : un match déjà joué ne s'affiche jamais
        .sort((a, b) => `${a.date} ${a.heure || ""}`.localeCompare(`${b.date} ${b.heure || ""}`));

      corps.innerHTML = matchs.length
        ? matchs.map(rendreLigne).join("")
        : `<tr><td colspan="7">Aucun match à venir pour cette équipe pour l'instant.</td></tr>`;
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

  // ---------- Page résultats : sélecteur de week-end ----------

  function initPageResultats(donnees) {
    const select = document.getElementById("selecteur-weekend");
    const corps = document.getElementById("corps-resultats");
    const caption = document.getElementById("caption-resultats");

    const weekends = [...donnees.weekends].sort((a, b) => a.id.localeCompare(b.id)); // ordre chronologique

    select.innerHTML = weekends
      .map((we) => `<option value="${we.id}">${we.label}</option>`)
      .join("");

    function rendreLigneResultat(m) {
      const domicile = m.lieu === "domicile";
      const badgeCls = domicile ? "domicile" : "exterieur";
      const badgeTxt = domicile ? "🏠 Domicile" : "🚌 Extérieur";
      const victoire = m.score_osuna > m.score_adversaire;
      const scoreTxt = `${m.score_osuna} - ${m.score_adversaire}`;

      return `
        <tr>
          <td data-label="Équipe">${m.equipe}${m.type ? ` <span style="color:var(--creme-dim); font-size:0.82em;">(${m.type})</span>` : ""}</td>
          <td data-label="Adversaire">${m.adversaire}</td>
          <td data-label="Lieu"><span class="badge ${badgeCls}">${badgeTxt}</span></td>
          <td data-label="Score">
            <span class="badge ${victoire ? "domicile" : "exterieur"}">${scoreTxt}</span>
            ${m.detail ? `<div style="font-size:0.78rem; color:var(--creme-dim); margin-top:4px;">${m.detail}</div>` : ""}
          </td>
        </tr>`;
    }

    function afficherWeekend(id) {
      const we = weekends.find((w) => w.id === id);
      if (!we) return;
      caption.textContent = we.label;
      corps.innerHTML = we.matchs.length
        ? we.matchs.map(rendreLigneResultat).join("")
        : `<tr><td colspan="4">Aucun résultat enregistré pour ce week-end.</td></tr>`;
    }

    select.addEventListener("change", () => afficherWeekend(select.value));

    if (weekends.length) {
      select.value = weekends[0].id;
      afficherWeekend(weekends[0].id);
    } else {
      corps.innerHTML = `<tr><td colspan="4">Aucun résultat enregistré pour l'instant.</td></tr>`;
    }
  }

  // ---------- Page licences : sélecteur d'équipe ----------

  function initPageLicences(donnees) {
    const select = document.getElementById("selecteur-equipe-licences");
    const corps = document.getElementById("corps-licences");
    const caption = document.getElementById("caption-licences");

    select.innerHTML = donnees.equipes
      .map((eq) => `<option value="${eq.id}">${eq.nom}</option>`)
      .join("");

    function afficherEquipeLicences(id) {
      const equipe = donnees.equipes.find((eq) => eq.id === id);
      if (!equipe) return;
      caption.textContent = equipe.nom;

      const joueurs = [...(equipe.joueurs || [])].sort((a, b) => a.nom.localeCompare(b.nom));

      corps.innerHTML = joueurs.length
        ? joueurs
            .map(
              (j) => `
        <tr>
          <td data-label="Nom">${j.nom}</td>
          <td data-label="N° de licence">${j.licence || "à compléter"}</td>
          <td data-label="N° de vareuse">${j.vareuse || "à compléter"}</td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="3">Aucun joueur renseigné pour cette équipe pour l'instant.</td></tr>`;
    }

    select.addEventListener("change", () => afficherEquipeLicences(select.value));

    if (donnees.equipes.length) {
      select.value = donnees.equipes[0].id;
      afficherEquipeLicences(donnees.equipes[0].id);
    }
  }

  // ---------- Point d'entrée ----------

  async function demarrer() {
    const majInfo = document.getElementById("maj-info");
    const pageHoraires = document.getElementById("corps-calendrier");
    const pagePanneau = document.getElementById("panneau-prochain-match");
    const pageResultats = document.getElementById("corps-resultats");
    const pageLicences = document.getElementById("corps-licences");

    if (pageHoraires || pagePanneau) {
      try {
        const donnees = await chargerJSON("horaires.json");
        if (majInfo) {
          majInfo.textContent = donnees.derniere_maj
            ? `Dernière synchronisation : ${formaterDate(donnees.derniere_maj)}`
            : "Dernière synchronisation inconnue";
        }
        if (pagePanneau) initPanneauProchainMatch(donnees);
        if (pageHoraires) initPageHoraires(donnees);
      } catch (err) {
        console.error(err);
        if (majInfo) majInfo.textContent = "Impossible de charger les horaires (horaires.json manquant ou invalide).";
        if (pagePanneau) pagePanneau.innerHTML = `<p class="panneau-eyebrow">Horaires indisponibles pour le moment</p>`;
        if (pageHoraires) pageHoraires.innerHTML = `<tr><td colspan="7">Aucune donnée disponible.</td></tr>`;
      }
    }

    if (pageResultats) {
      const majInfoResultats = document.getElementById("maj-info-resultats");
      try {
        const donnees = await chargerJSON("resultats.json");
        if (majInfoResultats) {
          majInfoResultats.textContent = donnees.derniere_maj
            ? `Dernière mise à jour : ${formaterDate(donnees.derniere_maj)}`
            : "Dernière mise à jour inconnue";
        }
        initPageResultats(donnees);
      } catch (err) {
        console.error(err);
        if (majInfoResultats) majInfoResultats.textContent = "Impossible de charger les résultats.";
        pageResultats.innerHTML = `<tr><td colspan="4">Aucune donnée disponible.</td></tr>`;
      }
    }

    if (pageLicences) {
      const majInfoLicences = document.getElementById("maj-info-licences");
      try {
        const donnees = await chargerJSON("licences.json");
        if (majInfoLicences) {
          majInfoLicences.textContent = donnees.derniere_maj
            ? `Dernière mise à jour : ${formaterDate(donnees.derniere_maj)}`
            : "Dernière mise à jour inconnue";
        }
        initPageLicences(donnees);
      } catch (err) {
        console.error(err);
        if (majInfoLicences) majInfoLicences.textContent = "Impossible de charger les licences.";
        pageLicences.innerHTML = `<tr><td colspan="3">Aucune donnée disponible.</td></tr>`;
      }
    }
  }

  demarrer();
})();
