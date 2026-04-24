import { Hono } from "hono";

const jwks = new Hono();

jwks.all("/jwks.json", (c) => {
  return new Response(
    JSON.stringify({
      keys: [
        {
          kty: "RSA",
          alg: "RS256",
          use: "sig",
          kid: "moodle-key-1",
          n: "PASTE_YOUR_BASE64URL_MODULUS_HERE",
          e: "AQAB",
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

export default jwks;
