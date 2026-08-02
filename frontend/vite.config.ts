import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

function serveOutputData(): Plugin {
  const outputRoot = path.resolve(__dirname, "../output");
  const analysesFixture = path.resolve(__dirname, "fixtures/analyses.json");

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const requestPath = (req.url ?? "").split("?")[0];
    const filePath =
      requestPath === "/analyses.json"
        ? analysesFixture
        : path.join(outputRoot, requestPath);

    const isAllowed =
      filePath === analysesFixture ||
      (filePath.startsWith(outputRoot + path.sep) && !filePath.includes(".."));
    if (!isAllowed) {
      res.statusCode = 403;
      res.end();
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        next();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
    });
  };

  return {
    name: "serve-output-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", handler);
    },
  };
}

export default defineConfig({
  plugins: [serveOutputData()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
