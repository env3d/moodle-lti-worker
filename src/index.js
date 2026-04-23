/**
 * Helper: Base64URL encoding
 */
const base64url = (obj) => {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

/**
 * Signs a JWT using RS256 for LTI 1.3 Client Assertion
 */
async function signJwt(payload, privateKeyPem) {
  if (!privateKeyPem || typeof privateKeyPem !== "string" || !privateKeyPem.trim()) {
    throw new Error("Missing LTI private key configuration. Set LTI_PRIVATE_KEY in worker environment variables.");
  }

  const pemContents = privateKeyPem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const header = { alg: "RS256", typ: "JWT", kid: "moodle-key-1" };
  const encodedHeader = base64url(header);
  const encodedPayload = base64url(payload);
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Define CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // Or "https://your-frontend-domain.com"
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // 2. Handle the "Preflight" OPTIONS request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // --- 1. JWKS ENDPOINT ---
    if (url.pathname === "/jwks.json") {
      return new Response(JSON.stringify({
        keys: [{
          kty: "RSA", alg: "RS256", use: "sig", kid: "moodle-key-1",
          n: "PASTE_YOUR_BASE64URL_MODULUS_HERE", e: "AQAB"
        }]
      }), { headers: { "Content-Type": "application/json" } });
    }

    // --- 2. DYNAMIC OIDC LOGIN ---
    if (url.pathname === "/login") {
      try {
        const formData = await request.formData();// Convert FormData entries to a plain object so JSON.stringify works

        // const debugData = Object.fromEntries(formData.entries());

        // return new Response(`Form Data: ${JSON.stringify(debugData, null, 2)}`, { 
        //   status: 400,
        //   headers: { "Content-Type": "application/json" }
        // });

        const iss = formData.get("iss"); // The Moodle site URL
        const client_id = formData.get("client_id");
        
        if (!iss) return new Response("Missing 'iss' parameter. Tool must be launched from Moodle.", { status: 400 });

        const authUrl = new URL(`${iss}/mod/lti/auth.php`);
        authUrl.searchParams.set("client_id", client_id);
        authUrl.searchParams.set("login_hint", formData.get("login_hint"));
        authUrl.searchParams.set("lti_message_hint", formData.get("lti_message_hint"));
        authUrl.searchParams.set("nonce", crypto.randomUUID());
        authUrl.searchParams.set("prompt", "none");
        authUrl.searchParams.set("redirect_uri", `https://${url.hostname}/launch`);
        authUrl.searchParams.set("response_mode", "form_post");
        authUrl.searchParams.set("response_type", "id_token");
        authUrl.searchParams.set("scope", "openid");
        authUrl.searchParams.set("state", crypto.randomUUID());
        
        return Response.redirect(authUrl.toString(), 302);
      } catch (e) {
        return new Response("Login Error: " + e.message, { status: 500 });
      }
    }

    // --- 3. DYNAMIC LAUNCH & GRADE ATTEMPT ---
    if (url.pathname === "/launch" && request.method === "POST") {
      try {
        const formData = await request.formData();

        const idToken = formData.get("id_token");

        // SAFETY CHECK: Prevent the "split of null" error
        if (!idToken) {
          return new Response("No id_token found. Ensure you are performing a POST launch from Moodle.", { status: 400 });
        }

        const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, '+').replace(/_/g, '/')));

        const iss = payload.iss; 
        // Handle array or string for aud
        const client_id = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;

        const agsClaim = payload["https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"];

        // A. Get Access Token from the specific Moodle instance
        const tokenEndpoint = `${iss}/mod/lti/token.php`;
        const grantPayload = {
          iss: client_id, 
          sub: client_id,
          aud: tokenEndpoint,
          iat: Math.floor(Date.now() / 1000) - 5,
          exp: Math.floor(Date.now() / 1000) + 60,
          jti: crypto.randomUUID()
        };

        const signedAssertion = await signJwt(grantPayload, env.LTI_PRIVATE_KEY);

        const tokenResp = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: signedAssertion,
            scope: "https://purl.imsglobal.org/spec/lti-ags/scope/score"
          })
        });

        const tokenData = await tokenResp.json();

        // So now we either redirect to final destination or output some debugging info

        // 1. Get the destination URL from Moodle's custom parameters
        // Moodle sends custom parameters prefixed with 'https://purl.imsglobal.org/spec/lti/claim/custom'
        const customParams = payload["https://purl.imsglobal.org/spec/lti/claim/custom"] || {};
        const destinationUrl = customParams.url || "";        
        const sampleBody = {
          user_id: payload.sub,
          lineitem: agsClaim ? agsClaim.lineitem : null,
          client_id: client_id, // The ID for this specific Moodle tool
          iss: iss,             // The Moodle site URL
          grade: 95             // Example
        };

        // 2. Encode the body to safely pass it in the URL
        const encodedData = btoa(JSON.stringify(sampleBody))
          .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

        // 3. Perform the redirect with the hash fragment
        if (destinationUrl) {
          // We use '#' so the data stays in the browser and isn't sent to your app's server logs
          const finalUrl = `${destinationUrl}#lti_context=${encodedData}`;
          return Response.redirect(finalUrl, 302);
        }

        // C. Final Output (Echo Everything)
        return new Response(JSON.stringify({
          message: "LTI Bridge Launch Successful",          
          host: iss,
          moodle_token: tokenData.access_token || "Token Fetch Failed",
          sampleBody: sampleBody,
          launch_payload: payload
        }, null, 2), { headers: { "Content-Type": "application/json" } });

      } catch (e) {
        return new Response("Launch Error: " + e.message, { status: 500 });
      }
    }

    // --- 4. NEW: UPDATE GRADE ENDPOINT ---
    if (url.pathname === "/update-grade" && request.method === "POST") {
      try {
        const body = await request.json();
        const { grade, user_id, lineitem, client_id, iss, comment } = body;

        // 1. Validation
        if (!grade || !user_id || !lineitem || !client_id || !iss) {
          return new Response("Missing required fields", { status: 400, headers: corsHeaders });
        }

        // 2. Fetch a FRESH Access Token right now
        const tokenEndpoint = `${iss}/mod/lti/token.php`;
        const grantPayload = {
          iss: client_id,
          sub: client_id,
          aud: tokenEndpoint,
          iat: Math.floor(Date.now() / 1000) - 5,
          exp: Math.floor(Date.now() / 1000) + 60,
          jti: crypto.randomUUID()
        };

        const signedAssertion = await signJwt(grantPayload, env.LTI_PRIVATE_KEY);
        const tokenResp = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: signedAssertion,
            scope: "https://purl.imsglobal.org/spec/lti-ags/scope/score"
          })
        });

        const tokenData = await tokenResp.json();
        if (!tokenData.access_token) {
          throw new Error("Failed to refresh Moodle access token.");
        }

        // 3. Submit the grade using the fresh token
        let scoreUrl = lineitem.includes('?') 
          ? `${lineitem.split('?')[0]}/scores?${lineitem.split('?')[1]}` 
          : `${lineitem}/scores`;

        const gradeResp = await fetch(scoreUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/vnd.ims.lis.v1.score+json"
          },
          body: JSON.stringify({
            "userId": user_id,
            "scoreGiven": parseFloat(grade),
            "scoreMaximum": 100,
            "comment": comment || "Auto-updated via Worker",
            "activityProgress": "Completed",
            "gradingProgress": "FullyGraded",
            "timestamp": new Date().toISOString()
          })
        });

        // Parse the response so we can return it to the user
        const resultText = await gradeResp.text();
        
        return new Response(JSON.stringify({
          success: gradeResp.ok,
          status: gradeResp.status,
          moodle_payload: resultText ? JSON.parse(resultText) : "Grade updated successfully"
        }), { 
          status: gradeResp.status, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json" 
          } 
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    return new Response("Endpoint Not Found. Use /login or /launch via Moodle.", { status: 404 });
  }

  
};