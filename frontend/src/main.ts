import { startApp } from "./app";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  startApp(app);
}
