import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';

/** A single research run containing up to 10 businesses. */
export const researchSessions = pgTable('research_sessions', {
  id: text('id').primaryKey(),
  /** Anonymous, unguessable session token stored client-side (no auth). */
  sessionToken: text('session_token').notNull(),
  /** Which research experience created this session: owner | prospect. */
  userType: text('user_type').notNull().default('prospect'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** One business (e-commerce store / brand) researched within a session. */
export const businesses = pgTable(
  'businesses',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => researchSessions.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    /** User-supplied brand name (optional — falls back to discovered name). */
    brandName: text('brand_name'),
    /** User-supplied proposed solution for this brand (input for assessment). */
    proposedSolution: text('proposed_solution'),
    displayName: text('display_name'),
    /** complete | partial */
    status: text('status').notNull(),
    monthlyTraffic: text('monthly_traffic'),
    products: text('products'),
    reviews: text('reviews'),
    quiz: text('quiz'),
    revenueOpportunity: text('revenue_opportunity'),
    growthAssessment: text('growth_assessment'),
    /** Raw captured signals with evidence classification. */
    rawSignals: jsonb('raw_signals'),
    /** Generated analysis (conservative / base / aggressive). */
    analysis: jsonb('analysis'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sessionIdx: index('businesses_session_idx').on(table.sessionId),
  })
);

/** Export transaction for the one-time $1.50 structured export. */
export const exportTransactions = pgTable('export_transactions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => researchSessions.id, {
    onDelete: 'set null',
  }),
  /** payment provider reference/transaction id (BRAIN-generated, sent as the Bachs `reference`) */
  transactionRef: text('transaction_ref'),
  /** hosted checkout URL (Bachs checkout_url) for the payment */
  authorizationUrl: text('authorization_url'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  /** unpaid | pending | paid | failed | refunded */
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  /** Whether the export file has been generated/unlocked. */
  exportStatus: text('export_status').notNull().default('locked'),
  /** R2 object key for the generated export file. */
  exportObjectKey: text('export_object_key'),
  exportDownloadUrl: text('export_download_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
