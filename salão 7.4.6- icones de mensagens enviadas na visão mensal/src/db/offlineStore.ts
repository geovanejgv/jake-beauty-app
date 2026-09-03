import Dexie, { Table } from 'dexie';

export interface ActionQueue {
  id?: number;
  url: string;
  method: string;
  body: any;
  timestamp: number;
}

export class OfflineDB extends Dexie {
  outbox!: Table<ActionQueue>;

  constructor() {
    super('studio_labeli_offline_db');
    this.version(1).stores({
      outbox: '++id, timestamp'
    });
  }
}

export const offlineDB = new OfflineDB();