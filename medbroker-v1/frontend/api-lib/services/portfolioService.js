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
 * @param {{includeInactive?: boolean}} [options] — App Admin's own
 * management view needs to see deactivated portfolios/products too, or
 * reactivating one would be impossible (it would simply vanish from the
 * list the moment it's deactivated). Every other consumer — Lead
 * Detail, Lead Import, Appointment Detail, User Admin's assignment
 * checkboxes — correctly wants active-only, the default.
 */
export async function listPortfoliosWithProducts({ includeInactive = false } = {}) {
  const rows = await executeQuery(
    `SELECT
       p.id, p.name, p.isActive AS "isActive",
       COALESCE(
         json_agg(
           json_build_object('id', prod.id, 'name', prod.name, 'isActive', prod.isActive)
           ORDER BY prod.displayOrder, prod.name
         ) FILTER (WHERE prod.id IS NOT NULL AND (prod.isActive = TRUE OR @includeInactive = TRUE)),
         '[]'
       ) AS products
     FROM Portfolio p
     LEFT JOIN Product prod ON prod.portfolioId = p.id AND prod.organisationId = p.organisationId
     WHERE p.organisationId = @organisationId AND (p.isActive = TRUE OR @includeInactive = TRUE)
     GROUP BY p.id, p.name, p.isActive
     ORDER BY p.name`,
    {
      organisationId:  { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      includeInactive: { type: sql.Bit, value: includeInactive },
    }
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

/**
 * Everything that references this Portfolio — Products under it, Leads
 * tagged with it, Users assigned to it. All three have real FK
 * constraints to Portfolio (see schema migration 0's LeadPortfolio/
 * UserPortfolio/Product definitions), so a raw DELETE would already be
 * physically blocked by Postgres if any of these are non-zero — this
 * exists to turn that into a clear, specific, friendly count BEFORE
 * attempting the delete, not to replace the DB's own protection, which
 * stays in place as the last-resort backstop regardless.
 * @param {string} portfolioId
 */
export async function checkPortfolioDependents(portfolioId) {
  const [[{ count: products }], [{ count: leads }], [{ count: users }]] = await Promise.all([
    executeQuery(`SELECT COUNT(*)::int AS count FROM Product WHERE portfolioId = @id`, { id: { type: sql.UniqueIdentifier, value: portfolioId } }),
    executeQuery(`SELECT COUNT(*)::int AS count FROM LeadPortfolio WHERE portfolioId = @id`, { id: { type: sql.UniqueIdentifier, value: portfolioId } }),
    executeQuery(`SELECT COUNT(*)::int AS count FROM UserPortfolio WHERE portfolioId = @id`, { id: { type: sql.UniqueIdentifier, value: portfolioId } }),
  ]);
  return { products, leads, users };
}

/**
 * Everything that references this Product. Two real FK-constrained
 * relationships (AppointmentProduct, BrokerProduct) plus one that
 * genuinely isn't: Appointment.productsInterestedIn is a JSON-
 * stringified array of product NAMES in a plain text column, not a
 * real foreign key — Postgres has no way to protect against deleting a
 * Product that's still mentioned there, so this checks it explicitly by
 * pattern-matching the JSON-serialised name, the one dependency check
 * in this pair that isn't just "ask the DB what it already enforces".
 * @param {string} productId
 * @param {string} productName
 */
export async function checkProductDependents(productId, productName) {
  const [[{ count: appointmentsSold }], [{ count: brokers }], [{ count: appointmentsInterested }]] = await Promise.all([
    executeQuery(`SELECT COUNT(*)::int AS count FROM AppointmentProduct WHERE productId = @id`, { id: { type: sql.UniqueIdentifier, value: productId } }),
    executeQuery(`SELECT COUNT(*)::int AS count FROM BrokerProduct WHERE productId = @id`, { id: { type: sql.UniqueIdentifier, value: productId } }),
    executeQuery(
      `SELECT COUNT(*)::int AS count FROM Appointment WHERE productsInterestedIn LIKE @pattern`,
      { pattern: { type: sql.NVarChar(sql.MAX), value: `%"${productName}"%` } }
    ),
  ]);
  return { appointmentsSold, brokers, appointmentsInterested };
}

/** @param {string} id */
export async function getProductName(id) {
  const row = await executeQuery(
    `SELECT name FROM Product WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
  return row[0]?.name ?? null;
}

/**
 * @param {string} id
 * @param {boolean} isActive
 */
export async function setPortfolioActive(id, isActive) {
  await executeQuery(
    `UPDATE Portfolio SET isActive = @isActive WHERE id = @id AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      isActive:       { type: sql.Bit,               value: isActive },
    }
  );
}

/**
 * @param {string} id
 * @param {boolean} isActive
 */
export async function setProductActive(id, isActive) {
  await executeQuery(
    `UPDATE Product SET isActive = @isActive WHERE id = @id AND organisationId = @organisationId`,
    {
      id:             { type: sql.UniqueIdentifier, value: id },
      organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() },
      isActive:       { type: sql.Bit,               value: isActive },
    }
  );
}

/**
 * Permanent delete — only ever called by the handler after
 * checkPortfolioDependents() has confirmed zero dependents; this
 * function doesn't re-check, it trusts the caller, same as every other
 * "guarded delete" in this codebase splits the check from the action.
 * @param {string} id
 */
export async function deletePortfolio(id) {
  await executeQuery(
    `DELETE FROM Portfolio WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}

/** @param {string} id */
export async function deleteProduct(id) {
  await executeQuery(
    `DELETE FROM Product WHERE id = @id AND organisationId = @organisationId`,
    { id: { type: sql.UniqueIdentifier, value: id }, organisationId: { type: sql.UniqueIdentifier, value: resolveOrganisationId() } }
  );
}
