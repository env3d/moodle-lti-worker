import { LTI_SCORE_SCOPE } from "../constants.js";
import { signJwt } from "./jwt.js";

export async function fetchMoodleAccessToken(iss, clientId, privateKeyPem) {
  const tokenEndpoint = `${iss}/mod/lti/token.php`;
  const grantPayload = {
    iss: clientId,
    sub: clientId,
    aud: tokenEndpoint,
    iat: Math.floor(Date.now() / 1000) - 5,
    exp: Math.floor(Date.now() / 1000) + 60,
    jti: crypto.randomUUID(),
  };

  const signedAssertion = await signJwt(grantPayload, privateKeyPem);
  const tokenResp = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: signedAssertion,
      scope: LTI_SCORE_SCOPE,
    }),
  });

  return tokenResp.json();
}

export function buildScoreUrl(lineitem) {
  return lineitem.includes("?")
    ? `${lineitem.split("?")[0]}/scores?${lineitem.split("?")[1]}`
    : `${lineitem}/scores`;
}
