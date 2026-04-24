import { Hono } from "hono";
import { CORS_HEADERS } from "./constants.js";
import jwks from "./routes/jwks.js";
import oidc from "./routes/oidc.js";
import launch from "./routes/launch.js";
import grades from "./routes/grades.js";

const app = new Hono();

app.options("*", () => {
  return new Response(null, { headers: CORS_HEADERS });
});

app.route("/", jwks);
app.route("/", oidc);
app.route("/", launch);
app.route("/", grades);

app.all("*", () => {
  return new Response("Endpoint Not Found. Use /login or /launch via Moodle.", { status: 404 });
});

export default app;