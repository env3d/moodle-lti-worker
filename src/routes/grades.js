import { Hono } from "hono";
import OAuth from "oauth-1.0a";
import crypto from "node:crypto";
import { CORS_HEADERS } from "../constants.js";
import { buildScoreUrl, fetchMoodleAccessToken } from "../services/moodle.js";

const grades = new Hono();

// Helper to post LTI 1.3 (AGS) grade
async function updateGradeLti13({ launchData, parsedGrade, comment, env }) {
  const { user_id, lineitem, client_id, iss } = launchData;

  const tokenData = await fetchMoodleAccessToken(iss, client_id, env.LTI_PRIVATE_KEY);
  if (!tokenData.access_token) {
    throw new Error("Failed to refresh Moodle access token.");
  }

  const scoreUrl = buildScoreUrl(lineitem);
  const gradeResp = await fetch(scoreUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/vnd.ims.lis.v1.score+json",
    },
    body: JSON.stringify({
      userId: user_id,
      scoreGiven: parsedGrade,
      scoreMaximum: 100,
      comment: comment || "Auto-updated via Worker",
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
      timestamp: new Date().toISOString(),
    }),
  });

  const resultText = await gradeResp.text();
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(resultText);
  } catch {
    parsedResponse = resultText || "Grade updated successfully";
  }

  return {
    ok: gradeResp.ok,
    status: gradeResp.status,
    moodle_payload: parsedResponse,
  };
}

// Helper to post LTI 1.1 (POX XML) grade
async function updateGradeLti11({ launchData, parsedGrade, env }) {
  const { sourced_id, outcome_url, consumer_key } = launchData;

  if (!sourced_id || !outcome_url) {
    throw new Error("Missing LTI 1.1 sourced_id or outcome_url in context.");
  }

  // LTI 1.1 scores are expected to be normalized floats between 0.0 and 1.0
  const normalizedScore = parsedGrade > 1 ? parsedGrade / 100 : parsedGrade;

  // 1. Correct POX XML Envelope structure
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXRequestHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${Date.now()}</imsx_messageIdentifier>
    </imsx_POXRequestHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultRequest>
      <resultRecord>
        <sourcedGUID>
          <sourcedId>${sourced_id}</sourcedId>
        </sourcedGUID>
        <result>
          <resultScore>
            <language>en</language>
            <textString>${normalizedScore.toFixed(2)}</textString>
          </resultScore>
        </result>
      </resultRecord>
    </replaceResultRequest>
  </imsx_POXBody>
</imsx_POXEnvelopeRequest>`;

  // 2. Compute SHA-1 body hash (Base64 encoded)
  const bodyHash = crypto.createHash("sha1").update(xmlBody, "utf8").digest("base64");

  const consumerSecret = 12345;

  const oauth = new OAuth({
    consumer: { key: consumer_key, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
      return crypto.createHmac("sha1", key).update(base_string).digest("base64");
    },
  });

  // 3. Include oauth_body_hash in the request authorization payload
  const requestData = {
    url: outcome_url,
    method: "POST",
    data: {
      oauth_body_hash: bodyHash,
    },
  };

  const authHeader = oauth.toHeader(oauth.authorize(requestData));

  const gradeResp = await fetch(outcome_url, {
    method: "POST",
    headers: {
      ...authHeader,
      "Content-Type": "application/xml",
    },
    body: xmlBody,
  });

  const resultText = await gradeResp.text();
  const isSuccess = gradeResp.ok && resultText.includes("imsx_codeMajor>success");

  return {
    ok: isSuccess,
    status: gradeResp.status,
    moodle_payload: resultText,
  };
}

grades.post("/update-grade", async (c) => {
  try {
    const body = await c.req.json();
    const { contextCode, grade, comment } = body;

    if (!contextCode || grade === undefined || grade === null) {
      return new Response("Missing required fields: contextCode, grade", { status: 400, headers: CORS_HEADERS });
    }

    const parsedGrade = Number(grade);
    if (Number.isNaN(parsedGrade)) {
      return new Response("Invalid grade: must be a number", { status: 400, headers: CORS_HEADERS });
    }

    const row = await c.env.DB
      .prepare("SELECT body FROM launch_contexts WHERE id = ?")
      .bind(contextCode)
      .first();

    if (!row) {
      return new Response("Invalid contextCode", { status: 404, headers: CORS_HEADERS });
    }

    const launchData = JSON.parse(row.body);
    let result;

    if (launchData.lti_version === "1.1") {
      result = await updateGradeLti11({ launchData, parsedGrade, env: c.env });
    } else {
      // Default to LTI 1.3 / LTI Advantage
      result = await updateGradeLti13({ launchData, parsedGrade, comment, env: c.env });
    }

    return new Response(
      JSON.stringify({
        success: result.ok,
        status: result.status,
        moodle_payload: result.moodle_payload,
      }),
      {
        status: result.status,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});

export default grades;