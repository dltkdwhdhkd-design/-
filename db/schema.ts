import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('mafia_rooms', {
  code: text('code').primaryKey(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  expires: integer('expires').notNull(),
  // Cheap copies of state fields so position writes need no JSON parsing (see lib/store.ts).
  liveGate: text('live_gate').notNull().default(''),
  liveLocks: text('live_locks').notNull().default(''),
});

export const fieldPositions = sqliteTable('field_positions', {
  code: text('code').notNull(),
  player: text('player').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  at: integer('at').notNull(),
  seq: integer('seq').notNull(),
  ack: integer('ack').notNull().default(0),
  clock: real('clock').notNull().default(0),
  warp: integer('warp').notNull().default(0),
  history: text('history').notNull().default('[]'),
  previous: text('previous').notNull(),
  place: text('place').notNull(),
  // The live connection that alone may write this player's movement (lease, see lib/live-server.ts).
  owner: text('owner').notNull().default(''),
  ownerAt: integer('owner_at').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.code, t.player] })]);
