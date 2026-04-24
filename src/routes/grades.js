import { Hono } from "hono";
import { CORS_HEADERS } from "../constants.js";
import { buildScoreUrl, fetchMoodleAccessToken } from "../services/moodle.js";

const grades = new Hono();

grades.post("/update-grade", async (c) => {
  try {
    const body = await c.req.json();
    const { contextCode, grade, comment } = body;

    if (!contextCode || !grade) {
      return new Response("Missing required fields: contextCode, grade", { status: 400, headers: CORS_HEADERS });
    }

    const row = await c.env.DB
      .prepare("SELECT body FROM launch_contexts WHERE id = ?")
      .bind(contextCode)
      .first();

    if (!row) {
      return new Response("Invalid contextCode", { status: 404, headers: CORS_HEADERS });
    }

    const { user_id, lineitem, client_id, iss } = JSON.parse(row.body);

    const tokenData = await fetchMoodleAccessToken(iss, client_id, c.env.LTI_PRIVATE_KEY);
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
        scoreGiven: parseFloat(grade),
        scoreMaximum: 100,
        comment: comment || "Auto-updated via Worker",
        activityProgress: "Completed",
        gradingProgress: "FullyGraded",
        timestamp: new Date().toISOString(),
      }),
    });

    const resultText = await gradeResp.text();

    return new Response(
      JSON.stringify({
        success: gradeResp.ok,
        status: gradeResp.status,
        moodle_payload: resultText ? JSON.parse(resultText) : "Grade updated successfully",
      }),
      {
        status: gradeResp.status,
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
