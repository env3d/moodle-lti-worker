import { Hono } from "hono";
import { decodeJwtPayload, base64url } from "../utils/encoding.js";
import { fetchMoodleAccessToken } from "../services/moodle.js";
import { ensureTable, upsertLaunchContext } from "../services/db.js";

const launch = new Hono();

launch.post("/launch", async (c) => {
  try {
    const formData = await c.req.formData();
    const idToken = formData.get("id_token");

    if (!idToken) {
      return new Response("No id_token found. Ensure you are performing a POST launch from Moodle.", { status: 400 });
    }

    const payload = decodeJwtPayload(idToken);
    const iss = payload.iss;
    const client_id = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const agsClaim = payload["https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"];

    const tokenData = await fetchMoodleAccessToken(iss, client_id, c.env.LTI_PRIVATE_KEY);

    const customParams = payload["https://purl.imsglobal.org/spec/lti/claim/custom"] || {};
    const destinationUrl = customParams.url || "";
    const lti_body = {
      user_id: payload.sub,
      lineitem: agsClaim ? agsClaim.lineitem : null,
      client_id: client_id,
      iss: iss,
      grade: 0,
    };

    await ensureTable(c.env.DB);
    const contextCode = await upsertLaunchContext(c.env.DB, lti_body);    

    const sampleBody = {
      contextCode: contextCode,
      grade: 0,
      comment: "Initial grade submission from LTI Bridge",
    };

    if (destinationUrl) {
      const finalUrl = `${destinationUrl}#context_code=${contextCode}`;
      return Response.redirect(finalUrl, 302);
    }

    return new Response(
      `Example cURL to update grade:\n\n` +
      `curl -d '${JSON.stringify(sampleBody)}' \\` + '\n' + 
      'https://test.jmadar.workers.dev/update-grade' + '\n\n' +
      'debug info:\n' +
      JSON.stringify(
        {
          message: "LTI Bridge Launch Successful",
          contextCode: contextCode,
          host: iss,
          moodle_token: tokenData.access_token || "Token Fetch Failed",
          code: contextCode,
          sampleBody: sampleBody,
          launch_payload: payload,
        },
        null,
        2
      ),
      { headers: { "Content-Type": "text/plain" } }
    );
  } catch (e) {
    return new Response("Launch Error: " + e.message, { status: 500 });
  }
});

export default launch;
