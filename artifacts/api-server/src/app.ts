import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { snakeCaseResponse } from "./lib/snakeCase";

const app: Express = express();
// Requests reach the API through the website's proxy on this computer (and the Cloudflare phone link or
// a web server in front of it), so the visitor's own address is in X-Forwarded-For. Trusting only
// proxies on this computer makes req.ip the real phone's address (used by the per-device limits and the
// audit log) without letting a visitor choose it.
app.set("trust proxy", "loopback");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(snakeCaseResponse);

app.get("/", (_req, res) => {
  res.json({ name: "Manila Zoo Navigation API", status: "ok" });
});

app.use("/api", router);

export default app;
