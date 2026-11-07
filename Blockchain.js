'use strict';

const Block = require('./Block');

const MONTANT_MAX = 1000000000; // plafond par transaction, en FCFA

class Blockchain {
  constructor(difficulte = 3) {
    this.difficulte = difficulte;
    this.chaine = [Block.genese(difficulte)];
    this.historiqueDestructions = [];
  }

  dernierBloc() {
    return this.chaine[this.chaine.length - 1];
  }

  /** Regles metier d'une transaction. Renvoie la liste des erreurs (vide = valide). */
  static verifierTransaction(tx) {
    const erreurs = [];
    if (!tx || typeof tx !== 'object') return ['Transaction absente ou illisible.'];
    const exp = typeof tx.expediteur === 'string' ? tx.expediteur.trim() : '';
    const dest = typeof tx.destinataire === 'string' ? tx.destinataire.trim() : '';
    if (!exp) erreurs.push('Expéditeur manquant.');
    if (!dest) erreurs.push('Destinataire manquant.');
    if (exp && dest && exp.toLowerCase() === dest.toLowerCase()) erreurs.push("L'expéditeur et le destinataire sont identiques.");
    if (typeof tx.montant !== 'number' || !Number.isInteger(tx.montant)) erreurs.push('Le montant doit être un nombre entier de FCFA.');
    else if (tx.montant <= 0) erreurs.push('Le montant doit être supérieur à 0.');
    else if (tx.montant > MONTANT_MAX) erreurs.push(`Le montant dépasse le plafond de ${MONTANT_MAX} FCFA.`);
    return erreurs;
  }

  /**
   * Controle complet de la chaine. Fonctionne sur des objets simples
   * (par exemple une chaine recue en JSON par l'API Express).
   * Renvoie { valide, erreurs: [{ index, message }] }.
   */
  static verifierChaine(chaine) {
    const erreurs = [];
    if (!Array.isArray(chaine) || chaine.length === 0) {
      return { valide: false, erreurs: [{ index: 0, message: 'Chaîne vide ou illisible.' }] };
    }
    const g = Block.TRANSACTION_GENESE;

    chaine.forEach((bloc, i) => {
      const ajouter = (message) => erreurs.push({ index: i, message });
      if (!bloc || typeof bloc !== 'object') return ajouter('Bloc illisible.');

      if (bloc.index !== i) ajouter(`Index incohérent : attendu ${i}, trouvé ${bloc.index}.`);
      if (Block.calculerHash(bloc) !== bloc.hash) ajouter('Hash invalide : le contenu du bloc ne correspond plus à son empreinte SHA-256.');
      if (!Number.isInteger(bloc.difficulte) || !String(bloc.hash).startsWith('0'.repeat(bloc.difficulte))) {
        ajouter('Preuve de travail invalide.');
      }
      if (!Number.isFinite(bloc.timestamp) || bloc.timestamp > Date.now() + 60000) ajouter('Horodatage invalide.');

      const tx = bloc.transaction || {};
      if (i === 0) {
        if (bloc.previousHash !== '0') ajouter('Bloc genèse altéré : previousHash doit valoir "0".');
        if (tx.expediteur !== g.expediteur || tx.destinataire !== g.destinataire || tx.montant !== g.montant) {
          ajouter('Bloc genèse altéré : sa transaction a été modifiée.');
        }
        return;
      }

      const precedent = chaine[i - 1] || {};
      if (bloc.previousHash !== precedent.hash) ajouter(`Lien rompu : previousHash ne correspond pas au hash du bloc #${i - 1}.`);
      if (bloc.timestamp < precedent.timestamp) ajouter('Horodatage antérieur au bloc précédent.');
      Blockchain.verifierTransaction(tx).forEach((m) => ajouter(`Transaction invalide : ${m}`));
    });

    return { valide: erreurs.length === 0, erreurs };
  }

  verifier() {
    return Blockchain.verifierChaine(this.chaine);
  }

  /** Supprime tous les blocs et repart d'un nouveau bloc genese. */
  detruire(rapport) {
    this.historiqueDestructions.push({ date: new Date().toISOString(), blocsPerdus: this.chaine.length, rapport });
    this.chaine = [Block.genese(this.difficulte)];
  }

  /**
   * Ajoute une transaction dans un nouveau bloc mine.
   * La chaine est verifiee avant l'ajout : si elle est incoherente, elle est detruite.
   */
  ajouterTransaction(transaction) {
    const erreursTx = Blockchain.verifierTransaction(transaction);
    if (erreursTx.length) {
      const e = new Error(erreursTx.join(' '));
      e.code = 'TRANSACTION_INVALIDE';
      throw e;
    }

    const rapport = this.verifier();
    if (!rapport.valide) {
      this.detruire(rapport);
      const e = new Error('Chaîne compromise : elle a été détruite.');
      e.code = 'CHAINE_DETRUITE';
      e.rapport = rapport;
      throw e;
    }

    const precedent = this.dernierBloc();
    const bloc = new Block({
      index: this.chaine.length,
      transaction: {
        expediteur: transaction.expediteur.trim(),
        destinataire: transaction.destinataire.trim(),
        montant: transaction.montant,
      },
      previousHash: precedent.hash,
      difficulte: this.difficulte,
    }).miner();

    this.chaine.push(bloc);
    return bloc;
  }
}

module.exports = Blockchain;
