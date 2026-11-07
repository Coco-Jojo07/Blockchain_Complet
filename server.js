'use strict';

const path = require('path');
const express = require('express');
const Blockchain = require('./Blockchain');

const PORT = Number(process.env.PORT) || 3000;
const DIFFICULTE = Number(process.env.DIFFICULTE) || 3;

/* ------------------------------------------------------------------ */
/* Affichage dans le terminal                                          */
/* ------------------------------------------------------------------ */

function fmtNombre(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function heure() {
  return '[' + new Date().toLocaleTimeString('fr-FR') + ']';
}

function titre(texte, car = '=') {
  const largeur = 78;
  const t = ` ${texte} `;
  const gauche = Math.floor((largeur - t.length) / 2);
  return car.repeat(gauche) + t + car.repeat(largeur - gauche - t.length);
}

function afficherBloc(bloc, chaine, dureeMs) {
  const tx = bloc.transaction;
  const genese = bloc.index === 0;
  console.log('');
  console.log(titre(genese ? 'BLOC GENESE #0' : `BLOC #${bloc.index}`));
  console.log(`  Index        : ${bloc.index}`);
  console.log(`  Timestamp    : ${bloc.timestamp}  (${fmtDate(bloc.timestamp)})`);
  console.log(`  Transaction  : ${tx.expediteur} -> ${tx.destinataire} : ${fmtNombre(tx.montant)} FCFA`);
  console.log(`  PreviousHash : ${bloc.previousHash}${genese ? '  (aucun bloc precedent)' : ''}`);
  console.log(`  Hash         : ${bloc.hash}`);
  console.log(`  Nonce        : ${fmtNombre(bloc.nonce)}  (difficulte ${bloc.difficulte}${dureeMs !== undefined ? `, mine en ${dureeMs} ms` : ''})`);
  if (!genese) {
    const precedent = chaine[bloc.index - 1];
    const ok = precedent && precedent.hash === bloc.previousHash;
    console.log(`  Lien         : ${ok ? 'OK' : 'ROMPU'} (previousHash ${ok ? '=' : '!='} hash du bloc #${bloc.index - 1})`);
  }
  console.log('='.repeat(78));
}

function afficherEtat(bc) {
  const total = bc.chaine.slice(1).reduce((s, b) => s + b.transaction.montant, 0);
  console.log(`${heure()} Chaine : ${bc.chaine.length} bloc(s), volume total ${fmtNombre(total)} FCFA`);
}

function afficherIncoherence(rapport, nbBlocs) {
  console.log('');
  console.log(titre('INCOHERENCE DETECTEE', '!'));
  rapport.erreurs.forEach((e) => console.log(`  Bloc #${e.index} : ${e.message}`));
  console.log(`  -> La chaine est detruite (${nbBlocs} bloc(s) supprime(s)).`);
  console.log('!'.repeat(78));
}

/* ------------------------------------------------------------------ */
/* Blockchain                                                          */
/* ------------------------------------------------------------------ */

const bc = new Blockchain(DIFFICULTE);

// Verifie la chaine ; si elle est incoherente, elle est detruite et un nouveau genese est cree.
function controlerEtDetruireSiBesoin() {
  const rapport = bc.verifier();
  if (rapport.valide) return { valide: true, erreurs: [] };
  const nb = bc.chaine.length;
  afficherIncoherence(rapport, nb);
  bc.detruire(rapport);
  console.log(`${heure()} Nouvelle chaine creee.`);
  afficherBloc(bc.chaine[0], bc.chaine);
  return { valide: false, erreurs: rapport.erreurs, blocsSupprimes: nb };
}

function lireMontant(m) {
  if (typeof m === 'string' && m.trim() !== '') return Number(m.trim());
  return m;
}

/* ------------------------------------------------------------------ */
/* Serveur web                                                         */
/* ------------------------------------------------------------------ */

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Etat resume pour la page
app.get('/api/chaine', (req, res) => {
  const dernier = bc.dernierBloc();
  res.json({ blocs: bc.chaine.length, dernierIndex: dernier.index, dernierHash: dernier.hash, difficulte: bc.difficulte });
});

// Saisie d'une transaction depuis la page
app.post('/api/transactions', (req, res) => {
  const body = req.body || {};
  const tx = {
    expediteur: typeof body.expediteur === 'string' ? body.expediteur : '',
    destinataire: typeof body.destinataire === 'string' ? body.destinataire : '',
    montant: lireMontant(body.montant),
  };

  console.log('');
  console.log(`${heure()} Saisie recue : ${tx.expediteur || '(vide)'} -> ${tx.destinataire || '(vide)'} : ${tx.montant} FCFA`);

  const erreurs = Blockchain.verifierTransaction(tx);
  if (erreurs.length) {
    console.log(`${heure()} Transaction refusee : ${erreurs.join(' ')}`);
    return res.status(400).json({ ok: false, erreurs });
  }

  const controle = controlerEtDetruireSiBesoin();
  if (!controle.valide) {
    return res.status(409).json({ ok: false, detruite: true, erreurs: controle.erreurs.map((e) => `Bloc #${e.index} : ${e.message}`) });
  }

  console.log(`${heure()} Minage du bloc #${bc.chaine.length} en cours...`);
  const debut = Date.now();
  const bloc = bc.ajouterTransaction(tx);
  afficherBloc(bloc, bc.chaine, Date.now() - debut);
  afficherEtat(bc);

  res.status(201).json({ ok: true, index: bloc.index, hash: bloc.hash, nonce: bloc.nonce, blocs: bc.chaine.length });
});

// Simulation d'attaque : modifier le montant d'un bloc deja enregistre
app.post('/api/simulation/falsifier', (req, res) => {
  const body = req.body || {};
  const index = Number(body.index);
  const montant = lireMontant(body.montant);

  if (!Number.isInteger(index) || index < 0 || index >= bc.chaine.length) {
    return res.status(400).json({ ok: false, erreurs: [`Le bloc #${body.index} n'existe pas (0 a ${bc.chaine.length - 1}).`] });
  }

  const bloc = bc.chaine[index];
  const ancien = bloc.transaction.montant;
  bloc.transaction.montant = montant;
  console.log('');
  console.log(`${heure()} SIMULATION D'ATTAQUE : montant du bloc #${index} modifie (${ancien} -> ${montant}).`);
  if (body.reminer === true) {
    bloc.miner();
    console.log(`${heure()} L'attaquant re-mine le bloc #${index} : nouveau hash ${bloc.hash}`);
  }

  const controle = controlerEtDetruireSiBesoin();
  if (controle.valide) {
    console.log(`${heure()} Aucune incoherence detectee.`);
    afficherEtat(bc);
    return res.json({ ok: true, detruite: false });
  }
  res.json({ ok: true, detruite: true, erreurs: controle.erreurs.map((e) => `Bloc #${e.index} : ${e.message}`) });
});

app.listen(PORT, () => {
  console.log(titre('BLOCKCHAIN FINANCIERE', '#'));
  console.log(`  Page de saisie : http://localhost:${PORT}`);
  console.log(`  Difficulte     : ${DIFFICULTE} zero(s) en tete du hash`);
  console.log(`  Arret          : Ctrl + C`);
  console.log('#'.repeat(78));
  afficherBloc(bc.chaine[0], bc.chaine);
  console.log(`${heure()} En attente de saisies depuis la page web...`);
});
