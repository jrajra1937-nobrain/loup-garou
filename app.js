// app.js (ESM) — Firebase + GitHub Pages
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection,
  onSnapshot, getDocs, writeBatch, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/** 1) REMPLIS ICI avec ton config Firebase (Console → Project settings → Web app) */
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- UI refs ----------
const $ = (id) => document.getElementById(id);

const connPill = $("connPill");
const phasePill = $("phasePill");

const setupGrid = $("setupGrid");
const gameUI = $("gameUI");

const pseudoInput = $("pseudo");
const savePseudoBtn = $("savePseudo");
const pseudoInfo = $("pseudoInfo");

const mjMode = $("mjMode");
const createGameBtn = $("createGame");
const createdCode = $("createdCode");
const copyCodeBtn = $("copyCode");

const joinCode = $("joinCode");
const joinGameBtn = $("joinGameBtn");

const roomCode = $("roomCode");
const leaveBtn = $("leaveBtn");

const meName = $("meName");
const meRole = $("meRole");
const meAlive = $("meAlive");
const mjName = $("mjName");

const playersList = $("playersList");
const logBox = $("log");
const scrollLogBtn = $("scrollLog");

const roleCard = $("roleCard");
const pmBox = $("pmBox");

const hostPanel = $("hostPanel");
const hostInfo = $("hostInfo");
const startBtn = $("startBtn");
const nightResolveBtn = $("nightResolveBtn");
const voteResolveBtn = $("voteResolveBtn");
const endBtn = $("endBtn");

const actionUI = $("actionUI");
const targetSelect = $("targetSelect");
const doActionBtn = $("doAction");
const actionHint = $("actionHint");

const voteUI = $("voteUI");
const voteSelect = $("voteSelect");
const doVoteBtn = $("doVote");
const voteHint = $("voteHint");

// ---------- game state ----------
let uid = null;
let currentGameId = null;
let currentGame = null;
let currentPlayers = [];
let myRole = null;

let unsub = [];
function clearSubs(){ unsub.forEach(fn=>fn && fn()); unsub = []; }

function setPhasePill(text){
  phasePill.textContent = `Phase: ${text ?? "—"}`;
}

// ---------- helpers ----------
function getPseudo(){
  return (localStorage.getItem("pseudo") || "").trim();
}
function setPseudo(v){
  localStorage.setItem("pseudo", v.trim());
}
function normalizeCode(s){
  return (s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
}
function randCode(len=6){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out="";
  for(let i=0;i<len;i++) out += chars[arr[i] % chars.length];
  return out;
}
function shuffle(array){
  const a = array.slice();
  for(let i=a.length-1;i>0;i--){
    const r = new Uint32Array(1); crypto.getRandomValues(r);
    const j = r[0] % (i+1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function roleFR(role){
  return role; // roles already FR
}

const ROLE = {
  ELEVE: "Élève",
  CDI: "Délégué CDI",
  GARDE: "3e de confiance",
  SEC: "Secrétaire",
  PROV: "Proviseur",
  PROF: "Professeur",
  PRESIDENT: "Président de classe",
};

// distribution 8–17 (d’après ton tableau)
const DIST = {
  8:  { eleve:2, cdi:1, garde:1, sec:1, prov:1, prof:2, pres:0 },
  9:  { eleve:2, cdi:1, garde:1, sec:1, prov:1, prof:2, pres:1 },
  10: { eleve:3, cdi:1, garde:1, sec:1, prov:1, prof:2, pres:1 },
  11: { eleve:4, cdi:1, garde:1, sec:1, prov:1, prof:2, pres:1 },
  12: { eleve:5, cdi:1, garde:1, sec:1, prov:1, prof:2, pres:1 },
  13: { eleve:5, cdi:1, garde:1, sec:1, prov:1, prof:3, pres:1 },
  14: { eleve:6, cdi:1, garde:1, sec:1, prov:1, prof:3, pres:1 },
  15: { eleve:7, cdi:1, garde:1, sec:1, prov:1, prof:3, pres:1 },
  16: { eleve:7, cdi:1, garde:1, sec:1, prov:1, prof:3, pres:2 },
  17: { eleve:8, cdi:1, garde:1, sec:1, prov:1, prof:3, pres:2 },
};

function buildRoles(n){
  const d = DIST[n];
  if(!d) throw new Error("Ce jeu est calibré pour 8 à 17 joueurs.");
  const roles = [];
  roles.push(...Array(d.eleve).fill(ROLE.ELEVE));
  roles.push(...Array(d.cdi).fill(ROLE.CDI));
  roles.push(...Array(d.garde).fill(ROLE.GARDE));
  roles.push(...Array(d.sec).fill(ROLE.SEC));
  roles.push(...Array(d.prov).fill(ROLE.PROV));
  roles.push(...Array(d.prof).fill(ROLE.PROF));
  roles.push(...Array(d.pres).fill(ROLE.PRESIDENT));
  return roles;
}

function roleCardFR(role){
  switch(role){
    case ROLE.ELEVE:
      return `<b>Élève</b><br><span class="muted">Aucune capacité spéciale.</span>`;
    case ROLE.CDI:
      return `<b>Délégué CDI</b><br><span class="muted">Chaque nuit, enquête sur 1 personne : <b>camp</b> (Élèves / Professeurs). Attention : le <b>Président de classe</b> apparaît comme <b>Élèves</b>.</span>`;
    case ROLE.GARDE:
      return `<b>3e de confiance</b><br><span class="muted">Chaque nuit, protège 1 personne (attaque annulée). <b>Impossible</b> de te protéger. <b>Impossible</b> de protéger la même personne deux nuits d’affilée.</span>`;
    case ROLE.SEC:
      return `<b>Secrétaire</b><br><span class="muted">Tu découvres le rôle de la personne exécutée (info privée).</span>`;
    case ROLE.PROV:
      return `<b>Proviseur</b><br><span class="muted">Immunisé contre l’attaque de nuit. Mais tu peux être exécuté le jour.</span>`;
    case ROLE.PROF:
      return `<b>Professeur</b><br><span class="muted">Chaque nuit, avec ton camp, choisis 1 personne à attaquer. Condition de victoire : quand le nombre de <b>Professeurs</b> atteint le nombre d’Élèves.</span>`;
    case ROLE.PRESIDENT:
      return `<b>Président de classe</b><br><span class="muted">Tu participes à l’attaque avec les Professeurs, mais au test du CDI tu apparais comme <b>Élèves</b>.</span>`;
    default:
      return `—`;
  }
}

async function log(gameId, text){
  await addDoc(collection(db, "games", gameId, "logs"), {
    ts: serverTimestamp(),
    text
  });
}

async function sendPM(gameId, toUid, text){
  await addDoc(collection(db, "games", gameId, "privateMessages", toUid, "items"), {
    ts: serverTimestamp(),
    text
  });
}

function show(el, yes){ el.classList.toggle("hidden", !yes); }

function renderPlayers(){
  playersList.innerHTML = "";
  const alive = currentPlayers.filter(p=>p.alive);
  const dead = currentPlayers.filter(p=>!p.alive);

  const line = (p) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(p.name)}</span>
      <span class="${p.alive ? "alive" : "dead"}">${p.alive ? "vivant" : "éliminé"}</span>`;
    playersList.appendChild(li);
  };

  alive.forEach(line);
  dead.forEach(line);

  // selects
  const aliveOpts = alive.map(p=>({id:p.uid, name:p.name}));
  fillSelect(targetSelect, aliveOpts, true);
  fillSelect(voteSelect, aliveOpts, true);
}

function fillSelect(sel, items, includeNone){
  const old = sel.value;
  sel.innerHTML = "";
  if(includeNone){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "— Choisir —";
    sel.appendChild(o);
  }
  items.forEach(it=>{
    const o = document.createElement("option");
    o.value = it.id;
    o.textContent = it.name;
    sel.appendChild(o);
  });
  // try keep
  if([...sel.options].some(o=>o.value===old)) sel.value = old;
}

function renderLog(items){
  logBox.innerHTML = "";
  items.forEach(it=>{
    const p = document.createElement("p");
    const d = it.ts?.toDate ? it.ts.toDate() : null;
    const prefix = d ? `[${d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}] ` : "";
    p.textContent = prefix + it.text;
    logBox.appendChild(p);
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function myPlayer(){
  return currentPlayers.find(p=>p.uid===uid) || null;
}

function isHost(){
  return currentGame?.hostUid === uid;
}

function updateMyPanel(){
  const p = myPlayer();
  meName.textContent = getPseudo() || "—";
  meRole.textContent = myRole ? roleFR(myRole) : "—";
  meAlive.textContent = p ? (p.alive ? "vivant" : "éliminé") : (isHost() ? "MJ" : "—");
  roleCard.innerHTML = myRole ? roleCardFR(myRole) : (isHost() ? "<b>Maître du jeu</b><br><span class='muted'>Tu ne joues pas, tu fais avancer la partie.</span>" : "—");
  show(hostPanel, isHost());

  const phase = currentGame?.phase || "—";
  setPhasePill(phase);

  // Actions UI
  show(actionUI, false);
  show(voteUI, false);

  if(!currentGame) return;

  // joueur éliminé -> plus d’action
  if(p && !p.alive){
    actionHint.textContent = "Tu es éliminé : pas d’action.";
    voteHint.textContent = "Tu es éliminé : pas de vote.";
    return;
  }

  // MJ n’a pas d’action
  if(isHost()){
    hostInfo.textContent = `Joueurs: ${currentPlayers.length} | Phase: ${phase} | Jour: ${currentGame.day ?? 0}`;
    return;
  }

  if(!myRole) return;

  if(phase === "night"){
    // night actions by role
    if(myRole === ROLE.GARDE){
      show(actionUI, true);
      doActionBtn.textContent = "Protéger";
      actionHint.textContent = "Choisis 1 personne à protéger (pas toi).";
      doActionBtn.dataset.type = "guard";
    } else if(myRole === ROLE.PROF || myRole === ROLE.PRESIDENT){
      show(actionUI, true);
      doActionBtn.textContent = "Attaquer";
      actionHint.textContent = "Choisis 1 personne à attaquer.";
      doActionBtn.dataset.type = "kill";
    } else if(myRole === ROLE.CDI){
      show(actionUI, true);
      doActionBtn.textContent = "Enquêter";
      actionHint.textContent = "Choisis 1 personne à enquêter (camp).";
      doActionBtn.dataset.type = "check";
    } else {
      actionHint.textContent = "Aucune action cette nuit.";
    }
  }

  if(phase === "day" || phase === "revote"){
    show(voteUI, true);
    doVoteBtn.textContent = "Voter";
    voteHint.textContent = phase === "revote"
      ? "Vote de départage (seulement candidats autorisés)."
      : "Vote pour exécuter quelqu’un.";
  }
}

async function ensurePseudoOrThrow(){
  const p = getPseudo();
  if(!p) throw new Error("Entre un pseudo d’abord.");
  if(p.length > 20) throw new Error("Pseudo trop long (max 20).");
}

async function createGame(){
  await ensurePseudoOrThrow();
  // make unique code
  let code = randCode();
  for(let i=0;i<5;i++){
    const snap = await getDoc(doc(db,"games",code));
    if(!snap.exists()) break;
    code = randCode();
  }

  const hostName = getPseudo();
  await setDoc(doc(db, "games", code), {
    hostUid: uid,
    hostName,
    createdAt: serverTimestamp(),
    phase: "lobby",
    day: 0,
    voteRound: 0,
    revoteCandidates: [],
    mjMode: !!mjMode.checked,
    ended: false,
  });

  await log(code, `Salle créée. MJ: ${hostName}. Rejoignez avec le code ${code}.`);
  createdCode.textContent = code;
  await joinGame(code, /*asHost*/true);
}

async function joinGame(code, asHost=false){
  await ensurePseudoOrThrow();
  code = normalizeCode(code);
  const gref = doc(db,"games",code);
  const gsnap = await getDoc(gref);
  if(!gsnap.exists()) throw new Error("Code invalide : salle introuvable.");

  currentGameId = code;
  roomCode.textContent = code;

  // If I am not the MJ-only host, add me as player
  const g = gsnap.data();
  const amHost = (g.hostUid === uid);
  const mjOnly = !!g.mjMode;
  const shouldBePlayer = !(amHost && mjOnly);

  if(shouldBePlayer){
    await setDoc(doc(db,"games",code,"players",uid), {
      uid,
      name: getPseudo(),
      alive: true,
      joinedAt: serverTimestamp(),
    }, { merge:true });
    await log(code, `${getPseudo()} a rejoint la salle.`);
  } else {
    await log(code, `${getPseudo()} est connecté comme MJ.`);
  }

  setupGrid.classList.add("hidden");
  gameUI.classList.remove("hidden");

  attachListeners(code);
}

function attachListeners(code){
  clearSubs();

  // game doc
  unsub.push(onSnapshot(doc(db,"games",code), (snap)=>{
    currentGame = snap.exists() ? snap.data() : null;
    mjName.textContent = currentGame?.hostName || "—";
    updateMyPanel();
  }));

  // players
  unsub.push(onSnapshot(collection(db,"games",code,"players"), (snap)=>{
    currentPlayers = snap.docs.map(d=>d.data()).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    renderPlayers();
    updateMyPanel();
  }));

  // my secret role (players + host that plays)
  unsub.push(onSnapshot(doc(db,"games",code,"secrets",uid), (snap)=>{
    myRole = snap.exists() ? snap.data().role : null;
    meRole.textContent = myRole ? roleFR(myRole) : (isHost() ? "MJ" : "—");
    updateMyPanel();
  }));

  // logs
  const qLogs = query(collection(db,"games",code,"logs"), orderBy("ts","asc"));
  unsub.push(onSnapshot(qLogs, (snap)=>{
    const items = snap.docs.map(d=>d.data());
    renderLog(items);
  }));

  // private messages (my)
  const qPM = query(collection(db,"games",code,"privateMessages",uid,"items"), orderBy("ts","asc"));
  unsub.push(onSnapshot(qPM, (snap)=>{
    const items = snap.docs.map(d=>d.data());
    pmBox.innerHTML = items.length ? "" : `<p class="muted">—</p>`;
    items.forEach(it=>{
      const p = document.createElement("p");
      p.style.margin = "8px 0";
      p.style.padding = "10px 12px";
      p.style.background = "rgba(255,255,255,.04)";
      p.style.border = "1px solid rgba(255,255,255,.08)";
      p.style.borderRadius = "12px";
      p.textContent = it.text;
      pmBox.appendChild(p);
    });
  }));
}

async function leaveGame(){
  if(!currentGameId) return;
  const code = currentGameId;

  // remove player doc (if exists)
  try{
    await setDoc(doc(db,"games",code,"players",uid), {}, {merge:true}); // no-op; keep history
  }catch{}

  clearSubs();
  currentGameId = null;
  currentGame = null;
  currentPlayers = [];
  myRole = null;

  gameUI.classList.add("hidden");
  setupGrid.classList.remove("hidden");
  setPhasePill("—");
  connPill.textContent = "Connecté";
}

function requireHost(){
  if(!isHost()) throw new Error("MJ uniquement.");
}
function requireGame(){
  if(!currentGameId || !currentGame) throw new Error("Pas de partie.");
}

async function startGame(){
  requireHost(); requireGame();
  if(currentGame.phase !== "lobby") throw new Error("Déjà commencé.");

  const playersSnap = await getDocs(collection(db,"games",currentGameId,"players"));
  const players = playersSnap.docs.map(d=>d.data()).filter(p=>p && p.uid);

  const n = players.length;
  if(n < 8 || n > 17) throw new Error("Cette version est calibrée pour 8 à 17 joueurs.");

  const roles = shuffle(buildRoles(n));
  const batch = writeBatch(db);

  // Assign roles
  let clerkUid = null;

  players.forEach((p, i)=>{
    const role = roles[i];
    batch.set(doc(db,"games",currentGameId,"secrets",p.uid), { role }, { merge:true });
    batch.set(doc(db,"games",currentGameId,"players",p.uid), { alive:true }, { merge:true });
    if(role === ROLE.SEC) clerkUid = p.uid;
  });

  batch.update(doc(db,"games",currentGameId), {
    phase: "night",
    day: 1,
    voteRound: 1,
    revoteCandidates: [],
    clerkUid: clerkUid || null,
    startedAt: serverTimestamp(),
  });

  await batch.commit();
  await log(currentGameId, `La partie commence. Nuit 1. (Le MJ fait avancer quand tout le monde a joué.)`);
}

async function writeNightAction(type, targetUid){
  requireGame();
  const phase = currentGame.phase;
  if(phase !== "night") throw new Error("Ce n’est pas la nuit.");

  const p = myPlayer();
  if(!p || !p.alive) throw new Error("Tu es éliminé.");

  if(!targetUid) throw new Error("Choisis une cible.");
  if(type === "guard" && targetUid === uid) throw new Error("Tu ne peux pas te protéger.");

  await setDoc(doc(db,"games",currentGameId,"nightActions",uid), {
    uid,
    type,
    targetUid,
    name: getPseudo(),
    ts: serverTimestamp(),
  }, { merge:true });

  // feedback in log? no (private)
}

async function writeVote(targetUid){
  requireGame();
  const phase = currentGame.phase;
  if(phase !== "day" && phase !== "revote") throw new Error("Ce n’est pas l’heure de voter.");

  const p = myPlayer();
  if(!p || !p.alive) throw new Error("Tu es éliminé.");
  if(!targetUid) throw new Error("Choisis une cible.");

  // if revote: restrict to candidates
  if(phase === "revote"){
    const cand = currentGame.revoteCandidates || [];
    if(!cand.includes(targetUid)) throw new Error("Vote de départage : cible non autorisée.");
  }

  await setDoc(doc(db,"games",currentGameId,"votes",uid), {
    uid,
    targetUid,
    round: currentGame.voteRound || 1,
    ts: serverTimestamp(),
  }, { merge:true });
}

function aliveIds(){
  return new Set(currentPlayers.filter(p=>p.alive).map(p=>p.uid));
}

async function resolveNight(){
  requireHost(); requireGame();
  if(currentGame.phase !== "night") throw new Error("Pas la nuit.");

  const gameId = currentGameId;
  const alive = aliveIds();

  // read all actions
  const actsSnap = await getDocs(collection(db,"games",gameId,"nightActions"));
  const acts = actsSnap.docs.map(d=>d.data()).filter(a=>alive.has(a.uid));

  // helper to get role (host can read)
  const roleOf = async (playerUid) => {
    const s = await getDoc(doc(db,"games",gameId,"secrets",playerUid));
    return s.exists() ? s.data().role : null;
  };

  let guardTarget = null;
  let killTarget = null;

  // gather actions by type
  const guardAct = acts.find(a=>a.type==="guard");
  if(guardAct) guardTarget = guardAct.targetUid;

  // kill: prefer PROF's action if exists, else PRESIDENT
  const killActs = acts.filter(a=>a.type==="kill");
  if(killActs.length){
    // choose by role priority
    let chosen = killActs[0];
    for(const ka of killActs){
      const r = await roleOf(ka.uid);
      if(r === ROLE.PROF){ chosen = ka; break; }
    }
    killTarget = chosen.targetUid;
  }

  // checks: send result to CDI
  const checkActs = acts.filter(a=>a.type==="check");
  for(const ca of checkActs){
    const rWho = await roleOf(ca.uid);
    if(rWho !== ROLE.CDI) continue;
    const targetRole = await roleOf(ca.targetUid);
    const isProfCamp = (targetRole === ROLE.PROF); // PRESIDENT counts as "Élèves" for check
    await sendPM(gameId, ca.uid, `📚 Résultat CDI : ${nameByUid(ca.targetUid)} est dans le camp ${isProfCamp ? "PROFESSEURS" : "ÉLÈVES"}.`);
  }

  // apply kill
  let deathUid = null;
  if(killTarget && alive.has(killTarget)){
    // guard success
    if(guardTarget && guardTarget === killTarget){
      await log(gameId, `🛡️ Une attaque a été empêchée cette nuit. Personne n’est éliminé.`);
    } else {
      const targetRole = await roleOf(killTarget);
      if(targetRole === ROLE.PROV){
        await log(gameId, `🌙 Une attaque a échoué. Personne n’est éliminé.`);
      } else {
        deathUid = killTarget;
      }
    }
  } else {
    await log(gameId, `🌙 La nuit se termine. (Aucune attaque valide.)`);
  }

  const batch = writeBatch(db);

  if(deathUid){
    batch.update(doc(db,"games",gameId,"players",deathUid), { alive:false });
    await log(gameId, `💀 Cette nuit, ${nameByUid(deathUid)} a été éliminé.`);
  }

  // clear night actions
  actsSnap.docs.forEach(d => batch.delete(d.ref));

  // move to day
  batch.update(doc(db,"games",gameId), {
    phase: "day",
    revoteCandidates: [],
  });

  await batch.commit();

  const win = await checkWinAndEndIfNeeded(gameId);
  if(!win) await log(gameId, `☀️ Jour ${currentGame.day}. Discussion puis vote.`);
}

async function resolveVote(){
  requireHost(); requireGame();
  const gameId = currentGameId;
  const phase = currentGame.phase;
  if(phase !== "day" && phase !== "revote") throw new Error("Pas l’heure de résoudre le vote.");

  const alive = aliveIds();
  const votesSnap = await getDocs(collection(db,"games",gameId,"votes"));
  const votes = votesSnap.docs.map(d=>d.data()).filter(v=>alive.has(v.uid) && alive.has(v.targetUid));

  // tally
  const tally = new Map();
  for(const v of votes){
    // if revote: enforce candidates
    if(phase === "revote"){
      const cand = currentGame.revoteCandidates || [];
      if(!cand.includes(v.targetUid)) continue;
    }
    tally.set(v.targetUid, (tally.get(v.targetUid)||0)+1);
  }

  if(tally.size === 0){
    await log(gameId, `🗳️ Aucun vote valide. Personne n’est exécuté.`);
    await goNextNight(gameId, votesSnap);
    return;
  }

  // max
  let max = 0;
  for(const c of tally.values()) max = Math.max(max, c);
  const top = [...tally.entries()].filter(([,c])=>c===max).map(([id])=>id);

  // tie -> revote with 2 candidates (if >2, take first 2 by alpha to avoid chaos)
  if(top.length !== 1){
    const cand = top
      .sort((a,b)=>nameByUid(a).localeCompare(nameByUid(b),"fr"))
      .slice(0,2);

    const batch = writeBatch(db);
    votesSnap.docs.forEach(d=>batch.delete(d.ref));
    batch.update(doc(db,"games",gameId), {
      phase: "revote",
      revoteCandidates: cand,
    });
    await batch.commit();

    await log(gameId, `⚖️ Égalité (${max} votes). Vote de départage entre: ${cand.map(id=>nameByUid(id)).join(" vs ")}`);
    return;
  }

  // execute
  const executedUid = top[0];

  // get executed role for secrétaire
  const secUid = currentGame.clerkUid || null;
  if(secUid){
    const rs = await getDoc(doc(db,"games",gameId,"secrets",executedUid));
    const executedRole = rs.exists() ? rs.data().role : "—";
    await sendPM(gameId, secUid, `🧾 Info Secrétaire : ${nameByUid(executedUid)} était **${executedRole}**.`);
  }

  const batch = writeBatch(db);
  batch.update(doc(db,"games",gameId,"players",executedUid), { alive:false });
  votesSnap.docs.forEach(d=>batch.delete(d.ref));

  await batch.commit();
  await log(gameId, `🔥 Exécution : ${nameByUid(executedUid)}.`);

  const win = await checkWinAndEndIfNeeded(gameId);
  if(!win){
    await goNextNight(gameId, null);
  }
}

async function goNextNight(gameId, votesSnapMaybe){
  const batch = writeBatch(db);

  // clear votes if provided
  if(votesSnapMaybe){
    votesSnapMaybe.docs.forEach(d=>batch.delete(d.ref));
  } else {
    const snap = await getDocs(collection(db,"games",gameId,"votes"));
    snap.docs.forEach(d=>batch.delete(d.ref));
  }

  const nextDay = (currentGame.day || 1) + 1;
  batch.update(doc(db,"games",gameId), {
    phase: "night",
    day: nextDay,
    voteRound: (currentGame.voteRound || 1) + 1,
    revoteCandidates: [],
  });

  await batch.commit();
  await log(gameId, `🌙 Nuit ${nextDay}. Chacun joue son action.`);
}

function nameByUid(u){
  const p = currentPlayers.find(x=>x.uid===u);
  return p ? p.name : u;
}

async function checkWinAndEndIfNeeded(gameId){
  // Win conditions from your rules:
  // - Élèves gagnent si PROFESSEUR (ROLE.PROF) = 0
  // - Professeurs gagnent si nb PROFESSEURS >= nb ÉLÈVES (camp élèves)
  const alive = currentPlayers.filter(p=>p.alive);
  // need role info for alive: host reads secrets
  const roles = await Promise.all(alive.map(async p=>{
    const s = await getDoc(doc(db,"games",gameId,"secrets",p.uid));
    return { uid:p.uid, role: s.exists()?s.data().role:null };
  }));

  const profOnly = roles.filter(r=>r.role===ROLE.PROF).length;
  const profCamp = roles.filter(r=>r.role===ROLE.PROF || r.role===ROLE.PRESIDENT).length;
  const eleveCamp = roles.length - profCamp;

  if(profOnly === 0){
    await updateDoc(doc(db,"games",gameId), { phase:"ended", ended:true, winner:"ÉLÈVES" });
    await log(gameId, `🏁 Victoire : camp ÉLÈVES (tous les Professeurs sont éliminés).`);
    return true;
  }

  if(profOnly >= eleveCamp){
    await updateDoc(doc(db,"games",gameId), { phase:"ended", ended:true, winner:"PROFESSEURS" });
    await log(gameId, `🏁 Victoire : camp PROFESSEURS (nombre de Professeurs ≥ camp Élèves).`);
    return true;
  }

  return false;
}

async function endGame(){
  requireHost(); requireGame();
  await updateDoc(doc(db,"games",currentGameId), { phase:"ended", ended:true, winner:"—" });
  await log(currentGameId, `🧹 Partie terminée par le MJ.`);
}

// ---------- UI events ----------
savePseudoBtn.onclick = () => {
  const v = pseudoInput.value.trim();
  if(!v) return;
  if(v.length>20){ pseudoInfo.textContent = "Pseudo trop long (max 20)."; return; }
  setPseudo(v);
  pseudoInfo.textContent = `Pseudo enregistré: ${v}`;
};

createGameBtn.onclick = async () => {
  try{
    await createGame();
  }catch(e){
    alert(e.message || String(e));
  }
};

copyCodeBtn.onclick = async () => {
  const c = createdCode.textContent.trim();
  if(!c || c==="—") return;
  await navigator.clipboard.writeText(c);
  alert("Code copié.");
};

joinGameBtn.onclick = async () => {
  try{
    await joinGame(joinCode.value);
  }catch(e){
    alert(e.message || String(e));
  }
};

leaveBtn.onclick = () => leaveGame();

scrollLogBtn.onclick = () => {
  logBox.scrollTop = logBox.scrollHeight;
};

doActionBtn.onclick = async () => {
  try{
    const type = doActionBtn.dataset.type;
    const target = targetSelect.value;
    await writeNightAction(type, target);
    alert("Action enregistrée.");
  }catch(e){
    alert(e.message || String(e));
  }
};

doVoteBtn.onclick = async () => {
  try{
    const target = voteSelect.value;
    await writeVote(target);
    alert("Vote enregistré.");
  }catch(e){
    alert(e.message || String(e));
  }
};

startBtn.onclick = async () => {
  try{ await startGame(); } catch(e){ alert(e.message || String(e)); }
};
nightResolveBtn.onclick = async () => {
  try{ await resolveNight(); } catch(e){ alert(e.message || String(e)); }
};
voteResolveBtn.onclick = async () => {
  try{ await resolveVote(); } catch(e){ alert(e.message || String(e)); }
};
endBtn.onclick = async () => {
  try{ await endGame(); } catch(e){ alert(e.message || String(e)); }
};

// ---------- auth boot ----------
pseudoInput.value = getPseudo();
pseudoInfo.textContent = getPseudo() ? `Pseudo actuel: ${getPseudo()}` : "";

connPill.textContent = "Connexion…";
signInAnonymously(auth).catch(err=>{
  console.error(err);
  alert("Erreur Firebase Auth (Anonymous). Vérifie que c’est activé.");
});

onAuthStateChanged(auth, (user)=>{
  if(!user) return;
  uid = user.uid;
  connPill.textContent = "Connecté";
});