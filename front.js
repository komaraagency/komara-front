/* ==========================================================================
   Komara Front — moteur de stratégie en temps réel
   Deux camps, une ligne de front. Le joueur déploie, l'IA répond.
   Tout est en 1D sur l'axe x (joli en 2D, simple à équilibrer).
   ========================================================================== */
(function () {
  "use strict";
  document.documentElement.setAttribute("data-moteur", "chargé");

  /* ------------------------------ unités -------------------------------- */
  const UNITES = {
    fanti: {
      nom: "Fanti", ico: "🪖", cout: 55, pv: 120, dmg: 10, portee: 160, cadence: 0.85,
      vit: 42, taille: 0.85, sol: true, desc: "Infanterie rapide",
    },
    appui: {
      nom: "Appui", ico: "🎯", cout: 95, pv: 170, dmg: 8, rafale: 3, portee: 195, cadence: 1.5,
      vit: 32, taille: 0.95, sol: true, desc: "Mitrailleuse d'appui",
    },
    roquette: {
      nom: "Roquette", ico: "🚀", cout: 140, pv: 130, dmg: 62, portee: 215, cadence: 2.1,
      vit: 26, taille: 0.9, sol: true, antiBlinde: 1.8, desc: "Anti-véhicule",
    },
    blinde: {
      nom: "Blindé", ico: "🚙", cout: 190, pv: 420, dmg: 24, portee: 175, cadence: 1.2,
      vit: 34, taille: 1.15, sol: false, desc: "Véhicule blindé",
    },
    char: {
      nom: "Char", ico: "🛡️", cout: 290, pv: 680, dmg: 68, portee: 205, cadence: 1.9,
      vit: 22, taille: 1.35, sol: false, desc: "Char lourd",
    },
    mortier: {
      nom: "Mortier", ico: "💥", cout: 230, pv: 140, dmg: 95, portee: 430, cadence: 3.4,
      vit: 15, taille: 0.95, sol: true, indirect: true, desc: "Tir en cloche",
    },
  };

  const ORDRE = ["fanti", "appui", "roquette", "blinde", "char", "mortier"];

  /* ------------------------------ missions ------------------------------ */
  const MISSIONS = [
    {
      id: "fouta", nom: "Fouta", sous: "Les hauteurs",
      pvJoueur: 1100, pvEnnemi: 850, revenuJoueur: 24, revenuEnnemi: 17,
      decompte: 40, disponibles: ["fanti", "appui", "roquette"],
      meteo: "aube", decor: "montagne",
      brief: "Une colonne hostile tient la crête. Reprends le passage du Fouta.",
    },
    {
      id: "mande", nom: "Mandé", sous: "La plaine",
      pvJoueur: 1100, pvEnnemi: 1150, revenuJoueur: 26, revenuEnnemi: 23,
      decompte: 45, disponibles: ["fanti", "appui", "roquette", "blinde"],
      meteo: "jour", decor: "savane",
      brief: "L'ennemi a des blindés. Sors tes roquettes et tiens la plaine.",
    },
    {
      id: "cote", nom: "La Côte", sous: "Le port",
      pvJoueur: 1200, pvEnnemi: 1500, revenuJoueur: 28, revenuEnnemi: 30,
      decompte: 50, disponibles: ["fanti", "appui", "roquette", "blinde", "char", "mortier"],
      meteo: "coucher", decor: "mer",
      brief: "Dernière ligne avant le port. Tout ce que tu as, maintenant.",
    },
  ];

  /* ---------------------------- sauvegarde ------------------------------ */
  const CLE = "komara-front-v1";
  const DEFAUT = { missions: {}, son: true, total: 0 };
  function lireSauvegarde() {
    try {
      const b = JSON.parse(localStorage.getItem(CLE) || "null");
      if (!b || typeof b !== "object") return { ...DEFAUT, missions: {} };
      return { ...DEFAUT, ...b, missions: b.missions || {} };
    } catch (e) { return { ...DEFAUT, missions: {} }; }
  }
  let sauvegarde = lireSauvegarde();
  function enregistrer() {
    try { localStorage.setItem(CLE, JSON.stringify(sauvegarde)); } catch (e) {}
  }

  /* -------------------------------- état -------------------------------- */
  const W = 1600;
  const etat = {
    ecran: "accueil",
    mission: 0,
    enPause: false,
    credit: 120,
    creditMax: 420,
    pvJoueur: 0, pvJoueurMax: 0,
    pvEnnemi: 0, pvEnnemiMax: 0,
    unites: [],
    projectiles: [],
    effets: [],
    flottants: [],
    temps: 0,
    decompte: 0,
    fini: false,
    tuees: 0, perdues: 0,
    terrainY: 0,
    prochaineVague: 0,
    shake: 0,
  };

  let mission = MISSIONS[0];
  let decoration = { nuages: [], arbres: [], sacs: [] };

  /* ------------------------------- canvas ------------------------------- */
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  let L = 0, H = 0, DPR = 1, echelle = 1;
  let ciel = null, cielCle = "";

  function redimensionner() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    L = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(L * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    echelle = L / W;
    etat.terrainY = (H / echelle) * 0.72;
    cielCle = "";
  }
  window.addEventListener("resize", redimensionner);

  /* -------------------------------- audio ------------------------------- */
  let actx = null;
  function audioPret() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) actx = new AC();
  }
  function son(freq, duree, type, vol) {
    if (!sauvegarde.son) return;
    audioPret();
    if (!actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + duree);
    g.gain.setValueAtTime(vol == null ? 0.08 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + duree + 0.02);
  }

  /* ------------------------------ utilitaires --------------------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ------------------------------ déploiement --------------------------- */
  function coutUnite(cle) {
    const u = UNITES[cle];
    const remise = 1;
    return Math.round(u.cout * remise);
  }

  function peutDeployer(cle) {
    return mission.disponibles.indexOf(cle) !== -1 && etat.credit >= coutUnite(cle);
  }

  function deploiement(camp, cle) {
    const modele = UNITES[cle];
    const cote = camp === "joueur";
    const base = cote ? 190 : W - 190;
    // decalage pour ne pas empiler au meme endroit
    let x = base + rnd(-18, 18);
    for (let i = 0; i < 12; i++) {
      const occupe = etat.unites.some((u) => u.camp === camp && Math.abs(u.x - x) < 34);
      if (!occupe) break;
      x = base + (cote ? 1 : -1) * (i + 1) * 30;
    }
    const pvMax = modele.pv * (cote ? 1 : mission.pvMul || 1);
    etat.unites.push({
      cle, camp, x, pv: pvMax, pvMax,
      cooldown: rnd(0.2, 0.9),
      cible: null,
      recul: 0,
      flash: 0,
      phase: Math.random() * 6.28,
      vivant: true,
    });
    if (cote) {
      son(220, 0.1, "square", 0.05);
    }
  }

  /* --------------------------------- IA --------------------------------- */
  let iaBudget = 0;
  function cerveauIA(dt) {
    if (etat.fini) return;
    iaBudget += mission.revenuEnnemi * dt;

    // choisit une unite adaptee a ce que le joueur aligne
    const blindesJoueur = etat.unites.filter((u) => u.camp === "joueur" && !UNITES[u.cle].sol).length;
    const choix = mission.disponibles.filter((c) => c !== "mortier" || Math.random() < 0.5);
    let preference = choix.slice();

    if (blindesJoueur >= 2) preference = preference.filter((c) => c === "roquette" || c === "char" || c === "appui");

    preference = preference.filter((c) => coutUnite(c) <= iaBudget);
    if (!preference.length) return;

    // rythme : une unite toutes les 1.1 a 2.6 s selon la difficulte
    etat.prochaineVague -= dt;
    if (etat.prochaineVague > 0) return;

    // prefere les unites cheres quand il en a les moyens
    preference.sort((a, b) => coutUnite(b) - coutUnite(a));
    const cle = preference[Math.floor(Math.random() * Math.min(2, preference.length))];
    iaBudget -= coutUnite(cle);
    deploiement("ennemi", cle);
    etat.prochaineVague = rnd(1.1, 2.6) / (mission.iaVitesse || 1);
  }

  /* ------------------------------- combat ------------------------------- */
  function cibleValide(u, c) {
    if (!c) return false;
    if (c.type === "qg") return true;
    return c.vivant !== false && c.pv > 0;
  }

  function chercherCible(u) {
    const ennemi = u.camp === "joueur" ? "ennemi" : "joueur";
    const modele = UNITES[u.cle];
    const portee = modele.portee;
    let meilleure = null;
    let meilleureDist = Infinity;

    // QG adverse
    const xQG = ennemi === "joueur" ? 120 : W - 120;
    const dqg = Math.abs(u.x - xQG);
    if (dqg <= portee) {
      meilleure = { type: "qg", x: xQG, camp: ennemi };
      meilleureDist = dqg;
    }

    for (const c of etat.unites) {
      if (!c.vivant || c.camp !== ennemi) continue;
      const d = Math.abs(c.x - u.x);
      if (d > portee) continue;
      if (d < meilleureDist) { meilleure = c; meilleureDist = d; }
    }
    return meilleure;
  }

  function tirer(u, cible) {
    const modele = UNITES[u.cle];
    const cote = u.camp === "joueur" ? 1 : -1;
    const departX = u.x + cote * 14 * modele.taille;
    const departY = etat.terrainY - 26 * modele.taille;

    const n = modele.rafale || 1;
    for (let i = 0; i < n; i++) {
      const cibleX = cible.type === "qg" ? cible.x : cible.x;
      if (modele.indirect) {
        etat.projectiles.push({
          type: "obus", x: departX, y: departY, x0: departX, x1: cibleX,
          t: 0, duree: 1.0 + Math.abs(cibleX - departX) / 700,
          dmg: modele.dmg, camp: u.camp, cible,
        });
      } else {
        etat.projectiles.push({
          type: "balle", x: departX, y: departY,
          vx: cote * (modele.antiBlinde ? 900 : 1150),
          x1: cibleX,
          dmg: modele.dmg, camp: u.camp, cible,
          antiBlinde: !!modele.antiBlinde,
          vie: 1.2,
        });
      }
      u.recul = 3;
    }
    u.flash = 0.08;

    if (modele.indirect) son(140, 0.18, "sine", 0.06);
    else if (modele.antiBlinde) son(320, 0.14, "sawtooth", 0.06);
    else son(560, 0.05, "square", 0.03);
  }

  function degats(cible, dmg, campAttaquant, antiBlinde) {
    if (cible.type === "qg") {
      if (campAttaquant === "joueur") etat.pvEnnemi = Math.max(0, etat.pvEnnemi - dmg);
      else etat.pvJoueur = Math.max(0, etat.pvJoueur - dmg);
      etat.effets.push({ type: "explosion", x: cible.x, y: etat.terrainY - 40, t: 0, taille: 0.7 });
      if (etat.pvJoueur <= 0 || etat.pvEnnemi <= 0) terminer();
      return;
    }
    let mult = 1;
    if (antiBlinde && !UNITES[cible.cle].sol) mult = 1.8;
    if (!antiBlinde && !UNITES[cible.cle].sol) mult = 0.75;
    cible.pv -= dmg * mult;
    cible.flash = 0.12;
    if (cible.pv <= 0 && cible.vivant) {
      cible.vivant = false;
      etat.effets.push({ type: "explosion", x: cible.x, y: etat.terrainY - 18, t: 0, taille: 1 });
      if (campAttaquant === "joueur") etat.tuees += 1; else etat.perdues += 1;
      son(90, 0.22, "sawtooth", 0.06);
      etat.shake = Math.min(6, etat.shake + 2);
    }
  }

  /* ------------------------------- update ------------------------------- */
  function mettreAJour(dt) {
    if (etat.ecran !== "jeu" || etat.enPause || etat.fini) return;
    etat.temps += dt;
    etat.shake *= 0.88;

    const mv = mission;
    etat.credit = Math.min(etat.creditMax, etat.credit + mv.revenuJoueur * dt);

    cerveauIA(dt);

    // unités
    for (const u of etat.unites) {
      if (!u.vivant) continue;
      const modele = UNITES[u.cle];
      u.cooldown -= dt;
      u.flash = Math.max(0, u.flash - dt);
      u.recul = Math.max(0, u.recul - dt * 22);
      u.phase += dt * (u.camp === "joueur" ? 1 : -1) * 5;

      if (!cibleValide(u, u.cible)) u.cible = chercherCible(u);

      const cible = u.cible;
      if (cible && cibleValide(u, cible)) {
        if (u.cooldown <= 0) {
          tirer(u, cible);
          u.cooldown = modele.cadence * rnd(0.9, 1.15);
        }
      } else {
        // avance vers le camp adverse
        const sens = u.camp === "joueur" ? 1 : -1;
        u.x += sens * modele.vit * dt;
      }
      u.x = clamp(u.x, 80, W - 80);
    }

    // séparation douce (evite l'empilement)
    for (let i = 0; i < etat.unites.length; i++) {
      const a = etat.unites[i];
      if (!a.vivant) continue;
      for (let j = i + 1; j < etat.unites.length; j++) {
        const b = etat.unites[j];
        if (!b.vivant) continue;
        const d = b.x - a.x;
        const mini = 26 * (UNITES[a.cle].taille + UNITES[b.cle].taille) * 0.5;
        if (Math.abs(d) < mini) {
          const poussee = (mini - Math.abs(d)) * 0.5 * (d > 0 ? -1 : 1);
          a.x += poussee * 0.5;
          b.x -= poussee * 0.5;
        }
      }
    }

    // nettoyage
    etat.unites = etat.unites.filter((u) => u.vivant);

    // projectiles
    for (const p of etat.projectiles) {
      if (p.type === "balle") {
        p.x += p.vx * dt;
        p.vie -= dt;
        const touche = (p.vx > 0 && p.x >= p.x1) || (p.vx < 0 && p.x <= p.x1);
        if (touche || p.vie <= 0) {
          if (touche && p.cible) {
            const encore = p.cible.type === "qg" || (p.cible.vivant && p.cible.pv > 0);
            if (encore) degats(p.cible, p.dmg, p.camp, p.antiBlinde);
          }
          if (touche) etat.effets.push({ type: "etincelle", x: p.x, y: p.y, t: 0 });
          p.mort = true;
        }
      } else {
        p.t += dt;
        if (p.t >= p.duree) {
          const encore = p.cible && (p.cible.type === "qg" || (p.cible.vivant && p.cible.pv > 0));
          if (encore) degats(p.cible, p.dmg, p.camp, true);
          etat.effets.push({ type: "explosion", x: p.x1, y: etat.terrainY - 14, t: 0, taille: 1.2 });
          son(70, 0.26, "sawtooth", 0.07);
          etat.shake = Math.min(7, etat.shake + 3);
          p.mort = true;
        }
      }
    }
    etat.projectiles = etat.projectiles.filter((p) => !p.mort);

    // effets
    for (const e of etat.effets) e.t += dt;
    etat.effets = etat.effets.filter((e) => e.t < (e.type === "explosion" ? 0.55 : 0.3));

    for (const f of etat.flottants) { f.t += dt; f.y -= 26 * dt; }
    etat.flottants = etat.flottants.filter((f) => f.t < 1.1);

    if (etat.pvJoueur <= 0 || etat.pvEnnemi <= 0) terminer();
  }

  /* -------------------------------- rendu ------------------------------- */
  function fondCiel() {
    const cle = mission.meteo + L + "x" + H + "x" + Math.round(etat.terrainY);
    if (cielCle === cle) return;
    cielCle = cle;
    const c = document.createElement("canvas");
    c.width = 32; c.height = 256;
    const g = c.getContext("2d");
    const stops = mission.meteo === "aube"
      ? ["#1d2a44", "#4a5a7a", "#c98a5e", "#e8b273", "#f0c98a"]
      : mission.meteo === "jour"
        ? ["#1f5f93", "#3d86b8", "#79b3d4", "#b6d4e2", "#e2edf0"]
        : ["#241a33", "#5a2f43", "#a8492f", "#d97a3a", "#f0a95c"];
    const grd = ctx.createLinearGradient(0, 0, 0, Math.max(60, etat.terrainY));
    stops.forEach((s, i) => grd.addColorStop(i / (stops.length - 1), s));
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 256);
    ciel = grd;
  }

  function dessiner() {
    if (!ctx) return;
    fondCiel();

    const s = echelle;
    const Hm = H / s;

    ctx.save();
    if (etat.shake > 0.4) {
      ctx.translate(rnd(-etat.shake, etat.shake), rnd(-etat.shake, etat.shake));
    }

    // ciel
    ctx.fillStyle = ciel || "#26303f";
    ctx.fillRect(0, 0, W, etat.terrainY + 4);

    // soleil / lune
    const sx = W * 0.72, sy = etat.terrainY * 0.34;
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, 210);
    halo.addColorStop(0, mission.meteo === "aube" ? "rgba(255,220,150,0.85)" : "rgba(255,255,230,0.7)");
    halo.addColorStop(0.35, mission.meteo === "aube" ? "rgba(255,180,110,0.28)" : "rgba(255,240,200,0.2)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sx, sy, 210, 0, Math.PI * 2); ctx.fill();

    dessinerMontagnes(etat.terrainY);
    dessinerSol();
    dessinerQG(120, "joueur");
    dessinerQG(W - 120, "ennemi");

    const unitesTriees = etat.unites.slice().sort((a, b) => (a.camp === b.camp ? a.x - b.x : 0));
    for (const u of unitesTriees) dessinerUnite(u);
    dessinerProjectiles();
    dessinerEffets();

    ctx.textAlign = "center";
    ctx.font = "900 26px -apple-system, system-ui, sans-serif";
    for (const f of etat.flottants) {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.fillStyle = "#000";
      ctx.fillText(f.texte, f.x + 1.5, f.y + 1.5);
      ctx.fillStyle = "#ffd700";
      ctx.fillText(f.texte, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // vignettage
    const vg = ctx.createRadialGradient(L / 2, H / 2, Math.min(L, H) * 0.3, L / 2, H / 2, Math.max(L, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, L, H);
  }

  function dessinerMontagnes(sol) {
    const couches = [
      { h: 150, c: "rgba(46,58,74,0.62)", dec: 0.32 },
      { h: 96, c: "rgba(62,74,80,0.8)", dec: 0.55 },
    ];
    couches.forEach((co, idx) => {
      ctx.fillStyle = co.c;
      ctx.beginPath();
      ctx.moveTo(0, sol + 20);
      const pas = 190;
      for (let x = -pas; x <= W + pas; x += pas) {
        const hh = co.h * (0.6 + 0.4 * Math.sin(x * 0.004 + idx * 2.1 + (mission.decor === "mer" ? 1 : 0)));
        ctx.lineTo(x + pas / 2, sol - hh);
        ctx.lineTo(x + pas, sol + 20);
      }
      ctx.lineTo(W, sol + 20);
      ctx.closePath();
      ctx.fill();
    });

    // mer au loin pour la côte
    if (mission.decor === "mer") {
      ctx.fillStyle = "rgba(30,90,120,0.55)";
      ctx.fillRect(0, sol - 34, W, 36);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 140 + ((etat.temps * 18) % 140), sol - 20);
        ctx.lineTo(i * 140 + 70 + ((etat.temps * 18) % 140), sol - 20);
        ctx.stroke();
      }
    }
  }

  function dessinerSol() {
    const y = etat.terrainY;
    const g = ctx.createLinearGradient(0, y, 0, y + 260);
    if (mission.decor === "montagne") {
      g.addColorStop(0, "#9a7a4e"); g.addColorStop(1, "#3d2c1a");
    } else if (mission.decor === "savane") {
      g.addColorStop(0, "#b08a45"); g.addColorStop(1, "#4a3316");
    } else {
      g.addColorStop(0, "#a58a5c"); g.addColorStop(1, "#43301b");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, 300);

    // ligne d'horizon
    ctx.fillStyle = "rgba(20,12,4,0.45)";
    ctx.fillRect(0, y - 4, W, 7);
    ctx.fillStyle = "rgba(255,225,170,0.16)";
    ctx.fillRect(0, y - 8, W, 3);

    // tranchées de sable
    const sacs = 26;
    for (let i = 0; i < sacs; i++) {
      const bx = 60 + i * 58 + (i % 2) * 12;
      if (bx > W - 60) break;
      ctx.fillStyle = i % 2 ? "#b99a68" : "#a98a58";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, y - 14, 46, 15, 7) : ctx.rect(bx, y - 14, 46, 15);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(bx + 3, y - 4, 40, 4);
    }

    // touffes d'herbe
    for (let i = 0; i < 90; i++) {
      const gx = (i * 197 % W) + 13;
      const gh = 6 + ((i * 37) % 9);
      ctx.strokeStyle = mission.decor === "savane" ? "rgba(160,140,60,0.5)" : "rgba(110,110,70,0.42)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx, y + 6);
      ctx.lineTo(gx + 3, y - gh);
      ctx.stroke();
    }
  }

  function dessinerQG(x, camp) {
    const y = etat.terrainY;
    const joueur = camp === "joueur";
    const pv = joueur ? etat.pvJoueur : etat.pvEnnemi;
    const pvMax = joueur ? etat.pvJoueurMax : etat.pvEnnemiMax;
    const ratio = pvMax ? pv / pvMax : 0;

    ctx.save();
    // base
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 8, 66, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = joueur ? "#2c3a2e" : "#3a2626";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 58, y - 62, 116, 66, 8) : ctx.rect(x - 58, y - 62, 116, 66);
    ctx.fill();

    ctx.fillStyle = joueur ? "#3c5140" : "#4d3030";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 48, y - 54, 96, 26, 5) : ctx.rect(x - 48, y - 54, 96, 26);
    ctx.fill();

    // toit / sacs
    ctx.fillStyle = "#9c8256";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 54, y - 70, 108, 12, 5) : ctx.rect(x - 54, y - 70, 108, 12);
    ctx.fill();

    // bande tricolore
    const cw = 36;
    ctx.fillStyle = "#d11231"; ctx.fillRect(x - cw / 2, y - 46, 12, 34);
    ctx.fillStyle = "#f5cf1b"; ctx.fillRect(x - cw / 2 + 12, y - 46, 12, 34);
    ctx.fillStyle = "#009a44"; ctx.fillRect(x - cw / 2 + 24, y - 46, 12, 34);

    // mat + drapeau
    ctx.strokeStyle = "#c9ccd2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 44, y - 70);
    ctx.lineTo(x + 44, y - 124);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const dec = Math.sin(etat.temps * 2.2 + i) * 2.4;
      ctx.fillStyle = ["#ce1126", "#fcd116", "#009460"][i];
      ctx.beginPath();
      ctx.moveTo(x + 45, y - 124 + dec);
      ctx.lineTo(x + 63, y - 124 - dec);
      ctx.lineTo(x + 63, y - 104 - dec);
      ctx.lineTo(x + 45, y - 104 + dec);
      ctx.closePath();
      ctx.fill();
    }

    // barre de vie au-dessus
    const bw = 96;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - bw / 2, y - 140, bw, 8);
    ctx.fillStyle = joueur ? "#35d07f" : "#ff5a4d";
    ctx.fillRect(x - bw / 2 + 1, y - 139, (bw - 2) * ratio, 6);

    if (ratio < 0.35 && Math.random() < 0.16) {
      etat.effets.push({ type: "fumee", x: x + rnd(-30, 30), y: y - 60, t: 0 });
    }
    ctx.restore();
  }

  function dessinerUnite(u) {
    const m = UNITES[u.cle];
    const y = etat.terrainY;
    const joueur = u.camp === "joueur";
    const t = m.taille * 2.3;
    const marche = Math.sin(u.phase) * 2.5;
    const x = u.x - (joueur ? 1 : -1) * u.recul;

    ctx.save();

    // ombre
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 16 * t, 5 * t, 0, 0, Math.PI * 2);
    ctx.fill();

    if (m.sol) {
      // ---------- soldat ----------
      const corps = joueur ? "#3f6b4a" : "#6b3a3a";
      const casque = joueur ? "#2f5238" : "#5a2b2b";
      // jambes
      ctx.strokeStyle = "#26302a";
      ctx.lineWidth = 3.4 * t;
      ctx.beginPath();
      ctx.moveTo(x - 3 * t, y - 14 * t);
      ctx.lineTo(x - 4 * t + marche, y);
      ctx.moveTo(x + 3 * t, y - 14 * t);
      ctx.lineTo(x + 4 * t - marche, y);
      ctx.stroke();
      // corps
      ctx.fillStyle = corps;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 7 * t, y - 30 * t, 14 * t, 18 * t, 4 * t) : ctx.rect(x - 7 * t, y - 30 * t, 14 * t, 18 * t);
      ctx.fill();
      // sac a dos
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(x + (joueur ? -9 * t : 5 * t), y - 26 * t, 4 * t, 10 * t);
      // tête + casque
      ctx.fillStyle = "#6b4527";
      ctx.beginPath(); ctx.arc(x, y - 34 * t, 5.2 * t, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = casque;
      ctx.beginPath(); ctx.arc(x, y - 35.6 * t, 5.6 * t, Math.PI, 0); ctx.fill();
      // arme
      ctx.strokeStyle = "#20242a";
      ctx.lineWidth = 2.6 * t;
      ctx.beginPath();
      ctx.moveTo(x + (joueur ? 3 * t : -3 * t), y - 24 * t);
      ctx.lineTo(x + (joueur ? 17 * t : -17 * t), y - 22 * t);
      ctx.stroke();
      // lance-roquettes plus epais
      if (u.cle === "roquette") {
        ctx.strokeStyle = "#4a4030";
        ctx.lineWidth = 5 * t;
        ctx.beginPath();
        ctx.moveTo(x + (joueur ? 2 * t : -2 * t), y - 27 * t);
        ctx.lineTo(x + (joueur ? 18 * t : -18 * t), y - 30 * t);
        ctx.stroke();
      }
      // mortier : tube incline
      if (u.cle === "mortier") {
        ctx.strokeStyle = "#3a3f46";
        ctx.lineWidth = 5 * t;
        ctx.beginPath();
        ctx.moveTo(x, y - 10 * t);
        ctx.lineTo(x + (joueur ? 10 * t : -10 * t), y - 30 * t);
        ctx.stroke();
      }
    } else {
      // ---------- véhicule ----------
      const caisse = joueur ? "#4a5f43" : "#6a3d38";
      const caisse2 = joueur ? "#5c7452" : "#7d4a43";
      // chenilles / roues
      ctx.fillStyle = "#1b1f22";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 22 * t, y - 10 * t, 44 * t, 11 * t, 4 * t) : ctx.rect(x - 22 * t, y - 10 * t, 44 * t, 11 * t);
      ctx.fill();
      ctx.fillStyle = "#2a3037";
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath(); ctx.arc(x + i * 6 * t, y - 4.5 * t, 3.2 * t, 0, Math.PI * 2); ctx.fill();
      }
      // caisse
      ctx.fillStyle = caisse;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 20 * t, y - 26 * t, 40 * t, 18 * t, 3 * t) : ctx.rect(x - 20 * t, y - 26 * t, 40 * t, 18 * t);
      ctx.fill();
      // tourelle
      ctx.fillStyle = caisse2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 8 * t, y - 34 * t, 16 * t, 10 * t, 3 * t) : ctx.rect(x - 8 * t, y - 34 * t, 16 * t, 10 * t);
      ctx.fill();
      // canon
      ctx.strokeStyle = "#20242a";
      ctx.lineWidth = 3.6 * t;
      ctx.beginPath();
      ctx.moveTo(x + (joueur ? 6 * t : -6 * t), y - 30 * t);
      ctx.lineTo(x + (joueur ? 26 * t : -26 * t), y - 31 * t);
      ctx.stroke();
      // bande tricolore
      ctx.fillStyle = "#d11231"; ctx.fillRect(x - 10 * t, y - 25 * t, 4 * t, 15 * t);
      ctx.fillStyle = "#f5cf1b"; ctx.fillRect(x - 6 * t, y - 25 * t, 4 * t, 15 * t);
      ctx.fillStyle = "#009a44"; ctx.fillRect(x - 2 * t, y - 25 * t, 4 * t, 15 * t);
    }

    // flash de tir
    if (u.flash > 0) {
      const fx = x + (joueur ? 20 * t : -20 * t);
      ctx.fillStyle = "rgba(255,220,120,0.9)";
      ctx.beginPath();
      ctx.arc(fx, y - 24 * t, 4.5 * t, 0, Math.PI * 2);
      ctx.fill();
    }

    // barre de vie
    if (u.pv < u.pvMax) {
      const bw = 26 * t;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - bw / 2, y - 46 * t, bw, 4.5);
      ctx.fillStyle = joueur ? "#35d07f" : "#ff6a5d";
      ctx.fillRect(x - bw / 2 + 0.5, y - 45.6 * t, (bw - 1) * Math.max(0, u.pv / u.pvMax), 3.5);
    }

    // flash de dégât
    if (u.flash > 0.06) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y - 20 * t, 16 * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function dessinerProjectiles() {
    for (const p of etat.projectiles) {
      if (p.type === "balle") {
        ctx.fillStyle = p.camp === "joueur" ? "#ffe9a3" : "#ffb0a3";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.camp === "joueur" ? "rgba(255,233,163,0.45)" : "rgba(255,176,163,0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y);
        ctx.stroke();
      } else {
        const k = p.t / p.duree;
        const x = p.x0 + (p.x1 - p.x0) * k;
        const y = etat.terrainY - 26 - Math.sin(k * Math.PI) * 150;
        ctx.fillStyle = "#2a2a2e";
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,180,80,0.6)";
        ctx.beginPath(); ctx.arc(x, y - 4, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function dessinerEffets() {
    for (const e of etat.effets) {
      if (e.type === "explosion") {
        const k = e.t / 0.55;
        const r = (14 + k * 52) * (e.taille || 1);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, "rgba(255,240,180," + (1 - k) * 0.95 + ")");
        g.addColorStop(0.4, "rgba(255,150,50," + (1 - k) * 0.7 + ")");
        g.addColorStop(1, "rgba(120,40,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "etincelle") {
        const k = e.t / 0.3;
        ctx.fillStyle = "rgba(255,235,170," + (1 - k) + ")";
        ctx.beginPath(); ctx.arc(e.x, e.y, 5 * (1 - k) + 1, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "fumee") {
        const k = e.t / 0.55;
        ctx.fillStyle = "rgba(60,60,60," + (1 - k) * 0.4 + ")";
        ctx.beginPath(); ctx.arc(e.x, e.y - k * 40, 10 + k * 20, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* --------------------------------- HUD -------------------------------- */
  const el = {
    credit: document.getElementById("valeur-credits"),
    barCredit: document.getElementById("bar-credits"),
    pvJ: document.getElementById("pv-joueur"),
    pvE: document.getElementById("pv-ennemi"),
    nom: document.getElementById("mission-nom"),
    cartes: document.getElementById("cartes"),
    annonce: document.getElementById("annonce"),
  };

  let cartesEls = {};
  function construireCartes() {
    el.cartes.innerHTML = "";
    cartesEls = {};
    ORDRE.forEach((cle) => {
      const m = UNITES[cle];
      const d = document.createElement("button");
      d.className = "carte-unite";
      d.innerHTML =
        '<span class="ico">' + m.ico + "</span>" +
        '<span class="nom">' + m.nom + "</span>" +
        '<span class="cout">' + coutUnite(cle) + "</span>";
      d.addEventListener("click", () => {
        if (!peutDeployer(cle)) {
          son(160, 0.1, "square", 0.05);
          return;
        }
        etat.credit -= coutUnite(cle);
        deploiement("joueur", cle);
        majHud(true);
      });
      el.cartes.appendChild(d);
      cartesEls[cle] = d;
    });
  }

  function majHud(force) {
    if (!el.credit) return;
    el.credit.textContent = Math.floor(etat.credit);
    el.barCredit.style.width = (etat.credit / etat.creditMax) * 100 + "%";
    el.pvJ.style.width = (etat.pvJoueurMax ? (etat.pvJoueur / etat.pvJoueurMax) * 100 : 0) + "%";
    el.pvE.style.width = (etat.pvEnnemiMax ? (etat.pvEnnemi / etat.pvEnnemiMax) * 100 : 0) + "%";

    ORDRE.forEach((cle) => {
      const b = cartesEls[cle];
      if (!b) return;
      const dispo = mission.disponibles.indexOf(cle) !== -1;
      b.classList.toggle("verrou", !dispo);
      b.classList.toggle("pauvre", dispo && etat.credit < coutUnite(cle));
      b.classList.toggle("pret", dispo && etat.credit >= coutUnite(cle));
    });
  }

  /* ------------------------------- annonce ------------------------------- */
  let annonceTimer = 0;
  function annonce(txt, duree) {
    if (!el.annonce) return;
    el.annonce.textContent = txt;
    el.annonce.classList.remove("cache");
    clearTimeout(annonceTimer);
    annonceTimer = setTimeout(() => el.annonce.classList.add("cache"), duree || 1800);
  }

  /* -------------------------------- boucle ------------------------------- */
  let dernier = 0;
  function boucle(ts) {
    if (!dernier) dernier = ts;
    let dt = (ts - dernier) / 1000;
    dernier = ts;
    dt = Math.min(dt, 0.05);
    mettreAJour(dt);
    if (etat.ecran === "jeu") { dessiner(); majHud(false); }
    requestAnimationFrame(boucle);
  }

  /* ------------------------------- écrans -------------------------------- */
  function afficher(id) {
    document.querySelectorAll(".ecran").forEach((e) => e.classList.toggle("actif", e.id === id));
    etat.ecran = id;
  }

  function demarrerMission(i) {
    etat.mission = clamp(i, 0, MISSIONS.length - 1);
    mission = MISSIONS[etat.mission];
    mission.pvMul = 1 + etat.mission * 0.08;
    mission.iaVitesse = 1 + etat.mission * 0.22;

    etat.credit = 120;
    etat.pvJoueurMax = mission.pvJoueur;
    etat.pvJoueur = mission.pvJoueur;
    etat.pvEnnemiMax = mission.pvEnnemi;
    etat.pvEnnemi = mission.pvEnnemi;
    etat.unites = [];
    etat.projectiles = [];
    etat.effets = [];
    etat.flottants = [];
    etat.temps = 0;
    etat.fini = false;
    etat.enPause = false;
    etat.tuees = 0;
    etat.perdues = 0;
    etat.shake = 0;
    etat.prochaineVague = 3;
    iaBudget = 60;

    el.nom.textContent = mission.nom + " · " + mission.sous;
    construireCartes();
    afficher("jeu");
    redimensionner();
    majHud(true);
    annonce(mission.brief, 3200);
    audioPret();
    if (actx && actx.state === "suspended") actx.resume();
  }

  function terminer() {
    if (etat.fini) return;
    etat.fini = true;
    const gagne = etat.pvEnnemi <= 0;
    const t = Math.max(0, Math.round(etat.temps));
    const ratio = etat.pvJoueurMax ? etat.pvJoueur / etat.pvJoueurMax : 0;
    let etoiles = 0;
    if (gagne) {
      etoiles = 1;
      if (ratio > 0.4) etoiles = 2;
      if (ratio > 0.7 && t < 150) etoiles = 3;
      const prec = sauvegarde.missions[mission.id];
      if (!prec || prec.etoiles < etoiles) {
        sauvegarde.missions[mission.id] = { etoiles, temps: t };
      }
      sauvegarde.total += 1;
      enregistrer();
    }

    document.getElementById("fin-etiquette").textContent = gagne ? "Mission accomplie" : "Ligne rompue";
    document.getElementById("fin-titre").textContent = gagne ? "Victoire" : "Défaite";
    document.getElementById("fin-texte").textContent = gagne
      ? (mission.nom + " est tenu. " + etat.tuees + " unités adverses neutralisées.")
      : "Ton QG est tombé. Reprends la mission avec plus de roquettes et de blindés.";

    document.getElementById("fin-stats").innerHTML =
      "<div><b>" + etat.tuees + "</b><span>Neutralisées</span></div>" +
      "<div><b>" + etat.perdues + "</b><span>Perdues</span></div>" +
      "<div><b>" + t + "s</b><span>Durée</span></div>";

    const btnSuiv = document.getElementById("btn-suivant");
    const suivante = etat.mission + 1;
    const debloquee = gagne && suivante < MISSIONS.length;
    btnSuiv.style.display = debloquee ? "block" : "none";

    document.getElementById("voile").classList.remove("cache");
    if (gagne) {
      son(660, 0.12, "sine", 0.1);
      setTimeout(() => son(880, 0.16, "sine", 0.1), 130);
    } else {
      son(150, 0.4, "sawtooth", 0.1);
    }
  }

  /* ------------------------------- accueil ------------------------------- */
  function dessinerAccueil() {
    const zone = document.getElementById("liste-missions");
    if (!zone) return;
    zone.innerHTML = "";
    MISSIONS.forEach((m, i) => {
      const fait = sauvegarde.missions[m.id];
      const dispo = i === 0 || sauvegarde.missions[MISSIONS[i - 1].id];
      const d = document.createElement("button");
      d.className = "mission" + (fait ? " faite" : "") + (dispo ? "" : " verrou");
      d.innerHTML =
        "<b>" + (i + 1) + ". " + m.nom + "</b>" +
        "<em>" + m.sous + " · " + m.disponibles.length + " unités</em>" +
        (fait ? '<span class="etoiles">' + "★".repeat(fait.etoiles) + "☆".repeat(3 - fait.etoiles) + "</span>" : "");
      d.addEventListener("click", () => {
        if (!dispo) return;
        demarrerMission(i);
      });
      zone.appendChild(d);
    });
  }

  function majRotation() {
    const r = document.getElementById("rotation");
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    const petit = Math.min(window.innerWidth, window.innerHeight) < 900;
    r.classList.toggle("actif", portrait && petit && !forcerPortrait && etat.ecran === "jeu");
  }
  let forcerPortrait = false;

  /* -------------------------------- boutons ------------------------------ */
  function brancher() {
    document.getElementById("btn-jouer").addEventListener("click", () => {
      audioPret();
      if (actx && actx.state === "suspended") actx.resume();
      let depart = 0;
      for (let i = 0; i < MISSIONS.length; i++) {
        if (!sauvegarde.missions[MISSIONS[i].id]) { depart = i; break; }
        depart = i;
      }
      demarrerMission(depart);
    });

    document.getElementById("btn-pause").addEventListener("click", () => {
      if (etat.ecran !== "jeu" || etat.fini) return;
      etat.enPause = !etat.enPause;
      document.getElementById("voile-pause").classList.toggle("cache", !etat.enPause);
    });
    document.getElementById("reprendre").addEventListener("click", () => {
      etat.enPause = false;
      document.getElementById("voile-pause").classList.add("cache");
    });
    document.getElementById("quitter").addEventListener("click", () => {
      document.getElementById("voile-pause").classList.add("cache");
      etat.enPause = false;
      dessinerAccueil();
      afficher("accueil");
    });

    document.getElementById("btn-rejouer").addEventListener("click", () => {
      document.getElementById("voile").classList.add("cache");
      demarrerMission(etat.mission);
    });
    document.getElementById("btn-suivant").addEventListener("click", () => {
      document.getElementById("voile").classList.add("cache");
      demarrerMission(etat.mission + 1);
    });
    document.getElementById("btn-menu").addEventListener("click", () => {
      document.getElementById("voile").classList.add("cache");
      dessinerAccueil();
      afficher("accueil");
    });

    const sonBtn = document.getElementById("btn-son");
    sonBtn.textContent = sauvegarde.son ? "🔊" : "🔇";
    sonBtn.addEventListener("click", () => {
      sauvegarde.son = !sauvegarde.son;
      enregistrer();
      sonBtn.textContent = sauvegarde.son ? "🔊" : "🔇";
    });

    document.getElementById("rot-continuer").addEventListener("click", () => {
      forcerPortrait = true;
      majRotation();
    });
    window.addEventListener("orientationchange", () => setTimeout(majRotation, 320));
    window.addEventListener("resize", () => { majRotation(); redimensionner(); });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && etat.ecran === "jeu" && !etat.enPause && !etat.fini) {
        etat.enPause = true;
        document.getElementById("voile-pause").classList.remove("cache");
      }
    });
  }

  function demarrer() {
    redimensionner();
    brancher();
    dessinerAccueil();
    afficher("accueil");
    majRotation();
    requestAnimationFrame(boucle);
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
