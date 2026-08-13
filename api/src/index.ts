import { errorResponse, json, authenticate } from './lib/db';
import { createOrganization, getOrganization, updateOrganization, Env } from './routes/organizations';
import { addParticipant, listParticipants, importParticipants } from './routes/participants';
import { triggerRound } from './routes/rounds';
import { getGroup, generateInvite } from './routes/groups';
import { runDueRounds } from './lib/scheduler';
import { createCheckout, createBillingPortalSession, handleStripeWebhook } from './routes/billing';

export default {
  // Runs on the schedule configured under [triggers] in wrangler.toml —
  // checks every org on an automatic (weekly/fortnightly/monthly) cadence
  // and runs a new round for whichever ones are due.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runDueRounds(env).then((outcomes) => {
        for (const o of outcomes) {
          if (o.result !== 'not_due') console.log(`[cron] org ${o.orgId}: ${o.result}`);
        }
      })
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      // POST /v1/organizations — no auth required, this is the entry point.
      if (path === '/v1/organizations' && method === 'POST') {
        return await createOrganization(request, env);
      }

      const orgMatch = path.match(/^\/v1\/organizations\/([^/]+)(\/.*)?$/);
      if (orgMatch) {
        const orgId = orgMatch[1];
        const sub = orgMatch[2] || '';

        // GET/PATCH /v1/organizations/:id
        if (sub === '') {
          if (method === 'GET') return await getOrganization(orgId, env);
          if (method === 'PATCH') return await updateOrganization(orgId, request, env);
        }

        // Everything below here is org-scoped and requires the org's API key.
        const org = await authenticate(request, env.DB, orgId);
        if (!org) return errorResponse('missing or invalid API key for this organization', 401);

        if (sub === '/participants') {
          if (method === 'POST') return await addParticipant(orgId, org, request, env);
          if (method === 'GET') return await listParticipants(orgId, env);
        }

        if (sub === '/participants/import' && method === 'POST') {
          return await importParticipants(orgId, org, request, env);
        }

        if (sub === '/rounds' && method === 'POST') {
          return await triggerRound(orgId, org, request, env);
        }

        if (sub === '/checkout' && method === 'POST') {
          return await createCheckout(orgId, org, request, env);
        }

        if (sub === '/billing-portal' && method === 'POST') {
          return await createBillingPortalSession(orgId, org, env);
        }
      }

      // Stripe webhook — no auth, verifies its own signature.
      if (path === '/v1/stripe/webhook' && method === 'POST') {
        return await handleStripeWebhook(request, env);
      }

      // GET /v1/groups/:id and POST /v1/groups/:id/invite
      const groupMatch = path.match(/^\/v1\/groups\/([^/]+)(\/invite)?$/);
      if (groupMatch) {
        const groupId = groupMatch[1];
        const isInvite = !!groupMatch[2];
        if (isInvite && method === 'POST') return await generateInvite(groupId, env);
        if (!isInvite && method === 'GET') return await getGroup(groupId, env);
      }

      if (path === '/v1/health') return json({ status: 'ok' });

      return errorResponse('not found', 404);
    } catch (err: any) {
      return errorResponse(`internal error: ${err.message || err}`, 500);
    }
  },
};
