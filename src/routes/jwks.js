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
          n: "nBy_7Ve1T9Tb5QRJ6FYP65mhC_dyCIEzxCM9acEi85Hs0zJSnPWnBgkfY-oZnY1AtcNj1hjwQebpp9SZZTXEs6lk158q6N1mRs4tDSdOFr12TNDPTg6aysZGzQwiZWFgNETQZQI9fx4wkrbasjz7kpEOgJ1nW4Jhpyb_mub2C_LqtlHV27XGqA9xwB3pm0-lEwU29ahbLJIJN361sr7MhxgWIoeZm_IO6Ogxb7ln9R6ESgnyO01Bnu_tqQiKCVDxIWux7mozYPh7eVaqjyjHcfAj3dL5zMvWp8YoE0mJLRIYm1KPlw9fQdXr_Spv_CvNDV-7yKTNmDELIvLDR5f_yw",
          e: "AQAB",
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

export default jwks;
