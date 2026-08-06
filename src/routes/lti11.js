import { Hono } from "hono";
import { ensureTable, upsertLaunchContext } from "../services/db.js";

const lti11 = new Hono();

async function parseFormBody(req) {
  const params = {};

  // 1. Extract URL query parameters (?custom_url=... or ?url=...)
  try {
    const url = new URL(req.url);
    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }
  } catch (e) {
    // Ignore URL parse errors
  }

  // 2. Extract and merge POST body parameters
  try {
    const text = await req.text();
    const searchParams = new URLSearchParams(text);
    for (const [key, value] of searchParams.entries()) {
      params[key] = value; // Body values will override query params if duplicate
    }
  } catch (e) {
    // Ignore body parse errors
  }

  return params;
}

lti11.post("/lti11", async (c) => {
  try {
    const params = await parseFormBody(c.req);

    // Grab core parameters from LTI 1.1 payload
    const userId = params.user_id || "";
    const sourcedId = params.lis_result_sourcedid || null; // Key identifier for grade passback
    const outcomeUrl = params.lis_outcome_service_url || null;
    const consumerKey = params.oauth_consumer_key || "";
    
    // Check multiple possible keys for the destination URL
    const destinationUrl = params.custom_url || params.url || params.custom_custom_url || "";

    // Map into your database storage object
    const lti_body = {
      user_id: userId,
      sourced_id: sourcedId,       // Needed for LTI 1.1 grade passback
      outcome_url: outcomeUrl,     // Needed for LTI 1.1 grade passback
      consumer_key: consumerKey,   // Needed for LTI 1.1 OAuth signing
      grade: 0,
      lti_version: "1.1",
    };

    await ensureTable(c.env.DB);
    const contextCode = await upsertLaunchContext(c.env.DB, lti_body);

    const sampleBody = {
      contextCode: contextCode,
      grade: 0.85, // LTI 1.1 requires a decimal float from 0.0 to 1.0
      comment: "Initial grade submission from LTI Bridge",
    };

    if (destinationUrl) {
      const finalUrl = `${destinationUrl}#context_code=${contextCode}`;
      return Response.redirect(finalUrl, 302);
    }

    return new Response(
      `Example cURL to update grade (LTI 1.1):\n\n` +
      `curl -d '${JSON.stringify(sampleBody)}' \\` + '\n' + 
      'https://test.jmadar.workers.dev/update-grade' + '\n\n' +
      'debug info:\n' +
      JSON.stringify(
        {
          message: "LTI 1.1 Launch Successful",
          contextCode: contextCode,
          code: contextCode,
          sampleBody: sampleBody,
          launch_payload: params,
        },
        null,
        2
      ),
      { headers: { "Content-Type": "text/plain" } }
    );
  } catch (e) {
    return new Response("LTI 1.1 Launch Error: " + e.message, { status: 500 });
  }
});

export default lti11;