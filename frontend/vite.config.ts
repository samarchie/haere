import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

function serveOutputData(): Plugin {
  const outputRoot = path.resolve(import.meta.dirname, "../output");

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const requestPath = (req.url ?? "").split("?")[0];
    const filePath = path.join(outputRoot, requestPath);

    const isAllowed =
      filePath.startsWith(outputRoot + path.sep) && !filePath.includes("..");
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

      const rangeHeader = req.headers.range;
      const rangeMatch =
        typeof rangeHeader === "string"
          ? rangeHeader.match(/^bytes=(\d+)-(\d+)$/)
          : null;

      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        res.setHeader("Accept-Ranges", "bytes");
        fs.createReadStream(filePath, { start, end }).pipe(res);
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
  plugins: [react(), serveOutputData()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
  },
});
