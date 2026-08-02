/**
 * handlers/portfolioHandlers.js — NEW (§90).
 * LIST is open to any authenticated role — every consumer (Lead Detail,
 * Lead Import, Appointment Detail's products-sold, User Admin's
 * assignment checkboxes, App Admin's management view) needs this same
 * reference data, and none of it is sensitive. CREATE is Admin/
 * GlobalAdmin only — a management action, matching Medical
 * Subscription's own creation gate (§80).
 * Routed through leads-router.js — no new Vercel function.
 */

import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listPortfoliosWithProducts, createPortfolio, createProduct,
  checkPortfolioDependents, checkProductDependents, getProductName,
  setPortfolioActive, setProductActive, deletePortfolio, deleteProduct,
} from '../services/portfolioService.js';
import { CreatePortfolioSchema, CreateProductSchema, UpdateActiveSchema } from '../models/lead.js';
import { isUuid } from '../http/helpers.js';

/** GET /api/leads/portfolios, POST /api/leads/portfolios */
export async function handlePortfoliosCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      const includeInactive = req.query.includeInactive === 'true';
      const portfolios = await listPortfoliosWithProducts({ includeInactive });
      return res.status(200).json({ portfolios });
    }

    if (req.method === 'POST') {
      requireRole(claims, ['Admin', 'GlobalAdmin']);
      const parsed = CreatePortfolioSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const newId = await createPortfolio(parsed.data.name);
      return res.status(201).json({ id: newId });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/portfolios error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** POST /api/leads/portfolios/:id/products */
export async function handlePortfolioProducts(req, res, portfolioId) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(portfolioId)) return res.status(400).json({ error: 'Invalid portfolio id format' });

    const parsed = CreateProductSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const newId = await createProduct(portfolioId, parsed.data.name);
    return res.status(201).json({ id: newId });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/portfolios/[id]/products error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/leads/portfolios/:id — {isActive} toggle.
 * DELETE /api/leads/portfolios/:id — guarded: checks dependents first
 * (Products under it, Leads tagged with it, Users assigned to it) and
 * returns a specific, friendly 409 naming what's still attached rather
 * than letting a raw FK-violation error reach the caller. Admin/
 * GlobalAdmin only, matching every other management action here.
 */
export async function handlePortfolioById(req, res, id) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid portfolio id format' });

    if (req.method === 'PUT') {
      const parsed = UpdateActiveSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      await setPortfolioActive(id, parsed.data.isActive);
      return res.status(200).json({ id, isActive: parsed.data.isActive });
    }

    if (req.method === 'DELETE') {
      const dependents = await checkPortfolioDependents(id);
      const { products, leads, users } = dependents;
      if (products > 0 || leads > 0 || users > 0) {
        const parts = [];
        if (products > 0) parts.push(`${products} product${products !== 1 ? 's' : ''}`);
        if (leads > 0) parts.push(`${leads} lead${leads !== 1 ? 's' : ''}`);
        if (users > 0) parts.push(`${users} user${users !== 1 ? 's' : ''}`);
        return res.status(409).json({
          error: `Cannot delete — still linked to ${parts.join(', ')}. Deactivate it instead, or remove those links first.`,
          dependents,
        });
      }
      await deletePortfolio(id);
      return res.status(200).json({ id, deleted: true });
    }

    res.setHeader('Allow', 'PUT, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/portfolios/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/leads/portfolios/:portfolioId/products/:productId — {isActive}
 * toggle.
 * DELETE /api/leads/portfolios/:portfolioId/products/:productId —
 * guarded: checks dependents first (AppointmentProduct, BrokerProduct —
 * real FK-constrained relationships — plus a text-pattern check against
 * Appointment.productsInterestedIn, which is NOT FK-constrained and
 * would otherwise be silently left dangling). Admin/GlobalAdmin only.
 * portfolioId isn't actually used here (products are looked up by their
 * own id, portfolioId is only in the URL for RESTful nesting matching
 * how they're created) — still validated for format, so a malformed
 * value in the URL fails clearly rather than being silently ignored.
 */
export async function handleProductById(req, res, portfolioId, productId) {
  try {
    const claims = await validateToken(req);
    requireRole(claims, ['Admin', 'GlobalAdmin']);

    if (!isUuid(portfolioId) || !isUuid(productId)) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    if (req.method === 'PUT') {
      const parsed = UpdateActiveSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      await setProductActive(productId, parsed.data.isActive);
      return res.status(200).json({ id: productId, isActive: parsed.data.isActive });
    }

    if (req.method === 'DELETE') {
      const name = await getProductName(productId);
      if (!name) return res.status(404).json({ error: 'Product not found' });

      const dependents = await checkProductDependents(productId, name);
      const { appointmentsSold, brokers, appointmentsInterested } = dependents;
      if (appointmentsSold > 0 || brokers > 0 || appointmentsInterested > 0) {
        const parts = [];
        if (appointmentsSold > 0) parts.push(`recorded as sold on ${appointmentsSold} appointment${appointmentsSold !== 1 ? 's' : ''}`);
        if (brokers > 0) parts.push(`assigned to ${brokers} broker${brokers !== 1 ? 's' : ''}`);
        if (appointmentsInterested > 0) parts.push(`noted as of interest on ${appointmentsInterested} appointment${appointmentsInterested !== 1 ? 's' : ''}`);
        return res.status(409).json({
          error: `Cannot delete — still ${parts.join(', ')}. Deactivate it instead, or remove those links first.`,
          dependents,
        });
      }
      await deleteProduct(productId);
      return res.status(200).json({ id: productId, deleted: true });
    }

    res.setHeader('Allow', 'PUT, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err.status) {
      const { status, body } = authErrorResponse(err);
      return res.status(status).json(body);
    }
    console.error('leads/portfolios/[id]/products/[id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
