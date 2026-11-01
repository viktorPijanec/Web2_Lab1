import express from "express";
import path from "path";
import oidc from "express-openid-connect";
const { auth, requiresAuth } = oidc;
import dotenv from "dotenv";
import { pool } from "./db.ts";
import { auth as jwtAuth, requiredScopes } from "express-oauth2-jwt-bearer";
import crypto from "node:crypto";
import QRCode from "qrcode";
dotenv.config();

const app = express();
app.set("views", path.join(import.meta.dirname, "views"));
app.set("view engine", "pug");
app.use(express.json());

const externalUrl = process.env.RENDER_EXTERNAL_URL;
const port =
  externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 4080;
const baseURL = externalUrl || `http://localhost:${port}`;

const checkJwt = jwtAuth({
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  audience: process.env.AUTH0_AUDIENCE,
  tokenSigningAlg: "RS256",
});

const config = {
  authRequired: false,
  idpLogout: true, //logout not only from the app, but also from identity provider
  secret: process.env.SESSION_SECRET,
  baseURL: baseURL,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientSecret: process.env.CLIENT_SECRET,
  routes: {
    logout: false as const, // library registers GET /logout only; POST is used instead (see below)
  },
  authorizationParams: {
    response_type: "code",
    //scope: "openid profile email"
  },
};
// auth router attaches /login and /callback routes to the baseURL (/logout is disabled in routes)
app.use(auth(config));

// logout changes state (removes session), so POST is used instead of GET
// (otherwise any page could log the user out with a link or redirect - logout CSRF)
app.post("/logout", (req, res) => res.oidc.logout());

app.get("/", async function (req, res) {
  let username: string | undefined;
  if (req.oidc.isAuthenticated()) {
    username = req.oidc.user?.name ?? req.oidc.user?.sub;
  }
  const result = await pool.query("SELECT * FROM passes");
  const passes = result.rows;
  const passCount = passes.length;
  const activePassCount = passes.filter(
    (pass: any) => pass.status === "ACTIVE",
  ).length;
  res.render("index", { username, passCount, activePassCount, passes });
});

app.post("/passes/:id/cancel", requiresAuth(), async (req, res) => {
  await pool.query(
    `
      UPDATE passes
      SET status = 'CANCELLED'
      WHERE id = $1
    `,
    [req.params.id],
  );

  res.redirect("/");
});

app.post("/passes/:id/delete", requiresAuth(), async (req, res) => {
  await pool.query(
    `
      DELETE FROM passes
      WHERE id = $1
    `,
    [req.params.id],
  );

  res.redirect("/");
});

app.get("/info/:id", async (req, res) => {
  const result = await pool.query("SELECT * FROM passes WHERE id = $1", [
    req.params.id,
  ]);
  const pass = result.rows[0];
  if (!pass) {
    return res.status(404).send("Pass not found");
  }
  res.render("info", { pass });
});

app.get(
  "/passes/:id",
  checkJwt,
  requiredScopes("read:passes"),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
          SELECT id, name, document, issued_at, status
          FROM passes
          WHERE id = $1
        `,
        [req.params.id],
      );

      const pass = result.rows[0];

      if (!pass) {
        return res.status(404).send("Pass not found");
      }

      return res.json({
        id: pass.id,
        name: pass.name,
        document: pass.document,
        issuedAt: pass.issued_at,
        status: pass.status,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/passes",
  checkJwt,
  requiredScopes("create:passes"),
  async (req, res, next) => {
    try {
      const { name, document } = req.body;

      if (
        typeof name !== "string" ||
        typeof document !== "string" ||
        name.trim() === "" ||
        document.trim() === ""
      ) {
        return res.status(400).send("name and document are required");
      }

      const id = crypto.randomUUID();

      await pool.query(
        `
          INSERT INTO passes (id, name, document, issued_at, status)
          VALUES ($1, $2, $3, NOW(), 'ACTIVE')
        `,
        [id, name.trim(), document.trim()],
      );

      const publicUrl = `${baseURL}/info/${id}`;
      const apiUrl = `${baseURL}/passes/${id}`;

      const qrBuffer = await QRCode.toBuffer(publicUrl, { type: "png" });

      return res
        .status(201)
        .set("Location", publicUrl)
        .type("png")
        .send(qrBuffer);
    } catch (error) {
      next(error);
    }
  },
);

const hostname = externalUrl ? "0.0.0.0" : "localhost";

app.listen(port, hostname, () => {
  console.log(`Server locally running at http://${hostname}:${port}/`);
  if (externalUrl) {
    console.log(`External URL: ${externalUrl}/`);
  }
});
