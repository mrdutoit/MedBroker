/**
 * functions/leads.js
 * Azure Functions HTTP handlers for the Lead resource.
 * Covers: list, get, create, assign, log call attempt, soft-delete.
 *
 * All routes require a valid Entra ID JWT except where noted.
 * Role requirements:
 *   - GET /leads            → Agent, Supervisor, Admin
 *   - GET /leads/:id        → Agent, Supervisor, Admin
 *   - POST /leads           → Admin, Supervisor (import/manual entry)
 *   - PUT /leads/:id/assign → Admin, Supervisor
 *   - POST /leads/:id/calls → Agent
 *   - DELETE /leads/:id     → Admin
 */

import { app } from '@azure/functions';
import { z } from 'zod';
import { validateToken, requireRole, authErrorResponse } from '../middleware/auth.js';
import {
  listLeads,
  getLeadById,
  createLead,
  assignLead,
  logCallAttempt,
  deleteLead,
} from '../services/leadService.js';
import {
  CreateLeadSchema,
  AssignLeadSchema,
  CallAttemptSchema,
  LeadListQuerySchema,
} from '../models/lead.js';

// ─── GET /api/leads ───────────────────────────────────────────────────────────

app.http('listLeads', {
  methods: ['GET'],
  route: 'leads',
  authLevel: 'anonymous', // JWT auth handled manually
  handler: async (request, context) => {
    try {
      const claims = await validateToken(request);
      requireRole(claims, ['Agent', 'Supervisor', 'Admin']);

      // Parse query parameters
      const queryParams = Object.fromEntries(request.query.entries());
      const parsed = LeadListQuerySchema.safeParse(queryParams);
      if (!parsed.success) {
        return { status: 400, jsonBody: { error: parsed.error.flatten() } };
      }

      // Agents can only see their own assigned leads
      const isAgent = claims.roles?.includes('Agent') && !claims.roles?.includes('Supervisor');
      if (isAgent) {
        parsed.data.agentId = claims.oid;
      }

      const result = await listLeads(parsed.data);
      return { status: 200, jsonBody: result };

    } catch (err) {
      if (err.status) return authErrorResponse(err);
      context.error('listLeads error:', err);
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});

// ─── GET /api/leads/:id ────────────────────────────────────────────────────────

app.http('getLeadById', {
  methods: ['GET'],
  route: 'leads/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const claims = await validateToken(request);
      requireRole(claims, ['Agent', 'Supervisor', 'Admin']);

      const { id } = request.params;
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        return { status: 400, jsonBody: { error: 'Invalid lead ID format' } };
      }

      const lead = await getLeadById(id);
      if (!lead) {
        return { status: 404, jsonBody: { error: 'Lead not found' } };
      }

      // Agents can only view their own assigned leads
      const isAgent = claims.roles?.includes('Agent') && !claims.roles?.includes('Supervisor');
      if (isAgent && lead.assignedAgentId !== claims.oid) {
        return { status: 403, jsonBody: { error: 'You are not assigned to this lead' } };
      }

      return { status: 200, jsonBody: lead };

    } catch (err) {
      if (err.status) return authErrorResponse(err);
      context.error('getLeadById error:', err);
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});

// ─── POST /api/leads ───────────────────────────────────────────────────────────

app.http('createLead', {
  methods: ['POST'],
  route: 'leads',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const claims = await validateToken(request);
      requireRole(claims, ['Admin', 'Supervisor']);

      let body;
      try {
        body = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: 'Request body must be valid JSON' } };
      }

      const parsed = CreateLeadSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, jsonBody: { error: parsed.error.flatten() } };
      }

      const newId = await createLead(parsed.data, claims.oid);
      return { status: 201, jsonBody: { id: newId } };

    } catch (err) {
      if (err.status) return authErrorResponse(err);
      context.error('createLead error:', err);
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});

// ─── PUT /api/leads/:id/assign ─────────────────────────────────────────────────

app.http('assignLead', {
  methods: ['PUT'],
  route: 'leads/{id}/assign',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const claims = await validateToken(request);
      requireRole(claims, ['Admin', 'Supervisor']);

      const { id } = request.params;

      let body;
      try {
        body = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: 'Request body must be valid JSON' } };
      }

      const parsed = AssignLeadSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, jsonBody: { error: parsed.error.flatten() } };
      }

      const lead = await getLeadById(id);
      if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

      await assignLead(id, parsed.data.agentId);
      return { status: 200, jsonBody: { success: true } };

    } catch (err) {
      if (err.status) return authErrorResponse(err);
      context.error('assignLead error:', err);
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});

// ─── POST /api/leads/:id/calls ─────────────────────────────────────────────────

app.http('logCallAttempt', {
  methods: ['POST'],
  route: 'leads/{id}/calls',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const claims = await validateToken(request);
      requireRole(claims, ['Agent', 'Supervisor', 'Admin']);

      const { id } = request.params;

      let body;
      try {
        body = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: 'Request body must be valid JSON' } };
      }

      const parsed = CallAttemptSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, jsonBody: { error: parsed.error.flatten() } };
      }

      const lead = await getLeadById(id);
      if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

      // Agents can only log calls for their assigned leads
      const isAgent = claims.roles?.includes('Agent') && !claims.roles?.includes('Supervisor');
      if (isAgent && lead.assignedAgentId !== claims.oid) {
        return { status: 403, jsonBody: { error: 'You are not assigned to this lead' } };
      }

      const { flaggedUncontactable } = await logCallAttempt(id, claims.oid, parsed.data);
      return { status: 201, jsonBody: { success: true, flaggedUncontactable } };

    } catch (err) {
      if (err.status) return authErrorResponse(err);
      context.error('logCallAttempt error:', err);
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});

// ─── DELETE /api/leads/:id ─────────────────────────────────────────────────────

app.http('deleteLead', {
  methods: ['DELETE'],
  route: 'leads/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const claims = await validateToken(request);
      requireRole(claims, ['Admin']);

      const { id } = request.params;
      const lead = await getLeadById(id);
      if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

      await deleteLead(id);
      return { status: 204 };

    } catch (err) {
      if (err.status) return authErrorResponse(err);
      context.error('deleteLead error:', err);
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
