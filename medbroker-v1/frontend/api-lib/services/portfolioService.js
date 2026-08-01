/**
 * services/portfolioService.js — NEW (§90).
 * Real Portfolio/Product management — the tables and seed data already
 * existed (Portfolio, Product, both correctly related via
 * Product.portfolioId), but nothing ever exposed them over the API.
 * Every consumer in the frontend (AppAdmin, User Admin's assignment
 * checkboxes, Lead Detail/Import, Appointment Detail's products-sold)
 * read a hardcoded, static copy of this same data from RoleContext.jsx
 * instead — meaning a new portfolio or product could never actually be
 * added anywhere in the app, regardless of what this page claimed.
 */
import { executeQuery, sql } from './db.js';
import { resolveOrganisationId } from '../context/tenant.js';

/**
 * Every portfolio with its products nested — the shape every consumer
 * actually needs (they all do "for each portfolio, its products", never
 * one without the other). One query, not two, using JSON aggregation
 * rather than fetching flat and joining client-side.
 */
export async function listPortfoliosWithProducts() {
  const rows = await executeQuery(
    `SELECT
       p.id, p.name, p.isActive AS "isActive",
       COALESCE(
         json_agg(
           json_build_object('id', prod.id, 'name', prod.name, 'isActive', prod.isActive)
           ORDER BY prod.displayOrder, prod.name
         ) FILTER (WHERE prod.id IS NOT NULL AND prod.isActive = TRUE),
         '[]'
       ) AS products
     FROM Portfolio p
     LEFT JOIN Product prod ON prod.portfolioId = p.id AND prod.organisationId = p.organisationId
     WHERE p.organisationId = @organisationId AND p.isActive = TRUE
     GROUP BY p.id, p.name, p.isActive
     ORDER BY p.name`,
    { organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
  // Defensive rather than assumed: node-postgres typically auto-parses
  // json/jsonb columns via its default type parsers, but this is the
  // first json_agg query in this codebase and there's no existing
  // precedent here to confirm that behaviour holds in this exact setup
  // — handling both the already-parsed-array case and the raw-JSON-
  // string case costs nothing and removes the risk of guessing wrong.
  return rows.map(r => ({
    ...r,
    products: typeof r.products === 'string' ? JSON.parse(r.products) : r.products,
  }));
}

/** @param {string} name */
export async function createPortfolio(name) {
  const newId = crypto.randomUUID();
  await executeQuery(
    `INSERT INTO Portfolio (id, organisationId, name, isActive, createdAt)
     VALUES (@id, @organisationId, @name, TRUE, NOW())`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      name:           { type: sql.NVarChar(200),    value: name },
    }
  );
  return newId;
}

/**
 * @param {string} portfolioId
 * @param {string} name
 */
export async function createProduct(portfolioId, name) {
  const newId = crypto.randomUUID();
  // displayOrder — appended after whatever's already there for this
  // portfolio, so new products land at the end of the list rather than
  // jumbling the existing curated order.
  await executeQuery(
    `INSERT INTO Product (id, organisationId, portfolioId, name, isActive, displayOrder, createdAt)
     VALUES (
       @id, @organisationId, @portfolioId, @name, TRUE,
       COALESCE((SELECT MAX(displayOrder) + 1 FROM Product WHERE portfolioId = @portfolioId), 0),
       NOW()
     )`,
    {
      id:             { type: sql.UniqueIdentifier, value: newId },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      portfolioId:    { type: sql.UniqueIdentifier, value: portfolioId },
      name:           { type: sql.NVarChar(200),    value: name },
    }
  );
  return newId;
}
