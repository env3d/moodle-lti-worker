import { Hono } from "hono";

const oidc = new Hono();

oidc.all("/login", async (c) => {
  try {
    const formData = await c.req.formData();
    const iss = formData.get("iss");
    const client_id = formData.get("client_id");

    if (!iss) {
      return new Response("Missing 'iss' parameter. Tool must be launched from Moodle.", { status: 400 });
    }

    const authUrl = new URL(`${iss}/mod/lti/auth.php`);
    authUrl.searchParams.set("client_id", client_id);
    authUrl.searchParams.set("login_hint", formData.get("login_hint"));
    authUrl.searchParams.set("lti_message_hint", formData.get("lti_message_hint"));
    authUrl.searchParams.set("nonce", crypto.randomUUID());
    authUrl.searchParams.set("prompt", "none");
    authUrl.searchParams.set("redirect_uri", `https://${new URL(c.req.url).hostname}/launch`);
    authUrl.searchParams.set("response_mode", "form_post");
    authUrl.searchParams.set("response_type", "id_token");
    authUrl.searchParams.set("scope", "openid");
    authUrl.searchParams.set("state", crypto.randomUUID());

    return Response.redirect(authUrl.toString(), 302);
  } catch (e) {
    return new Response("Login Error: " + e.message, { status: 500 });
  }
});

export default oidc;
