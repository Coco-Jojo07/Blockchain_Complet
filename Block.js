'use strict';

const crypto = require('crypto');

/**
 * Un bloc de la chaine.
 * Champs : index, timestamp, transaction, previousHash, nonce, difficulte, hash.
 * Le hash est un SHA-256 calcule sur l'ensemble des autres champs :
 * modifier un seul caractere de la transaction change completement le hash.
 */
class Block {
  constructor({ index, timestamp = Date.now(), transaction, previousHash = '0', difficulte = 3, nonce = 0, hash = '' }) {
    this.index = index;
    this.timestamp = timestamp;
    this.transaction = {
      expediteur: transaction.expediteur,
      destinataire: transaction.destinataire,
      montant: transaction.montant,
    };
    this.previousHash = previousHash;
    this.nonce = nonce;
    this.difficulte = difficulte;
    this.hash = hash;
  }

  /**
   * Chaine de caracteres hachee. Statique pour pouvoir verifier
   * aussi des blocs recus en JSON (objets simples, sans methodes).
   * L'ordre des champs est fixe : il doit etre identique partout.
   */
  static contenu(bloc) {
    const tx = bloc.transaction || {};
    return [
      bloc.index,
      bloc.previousHash,
      bloc.timestamp,
      JSON.stringify({ expediteur: tx.expediteur, destinataire: tx.destinataire, montant: tx.montant }),
      bloc.nonce,
      bloc.difficulte,
    ].join('|');
  }

  static calculerHash(bloc) {
    return crypto.createHash('sha256').update(Block.contenu(bloc), 'utf8').digest('hex');
  }

  calculerHash() {
    return Block.calculerHash(this);
  }

  /**
   * Preuve de travail : on incremente le nonce jusqu'a obtenir
   * un hash qui commence par `difficulte` zeros.
   */
  miner() {
    const cible = '0'.repeat(this.difficulte);
    this.nonce = 0;
    this.hash = this.calculerHash();
    while (!this.hash.startsWith(cible)) {
      this.nonce += 1;
      this.hash = this.calculerHash();
    }
    return this;
  }

  static genese(difficulte = 3) {
    return new Block({
      index: 0,
      transaction: Block.TRANSACTION_GENESE,
      previousHash: '0',
      difficulte,
    }).miner();
  }
}

Block.TRANSACTION_GENESE = Object.freeze({ expediteur: 'Réseau', destinataire: 'Réseau', montant: 0 });

module.exports = Block;
