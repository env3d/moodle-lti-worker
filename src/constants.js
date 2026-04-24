export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const JWT_HEADER = { alg: "RS256", typ: "JWT", kid: "moodle-key-1" };

export const LTI_SCORE_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score";
