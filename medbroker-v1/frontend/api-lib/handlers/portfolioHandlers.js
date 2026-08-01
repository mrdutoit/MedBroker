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
import { listPortfoliosWithProducts, createPortfolio, createProduct } from '../services/portfolioService.js';
import { CreatePortfolioSchema, CreateProductSchema } from '../models/lead.js';
import { isUuid } from '../http/helpers.js';

/** GET /api/leads/portfolios, POST /api/leads/portfolios */
export async function handlePortfoliosCollection(req, res) {
  try {
    const claims = await validateToken(req);

    if (req.method === 'GET') {
      const portfolios = await listPortfoliosWithProducts();
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
