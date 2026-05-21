import DemoApp from "./App";
import { startDemo } from "./controller";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root.");

new DemoApp().render(root);
startDemo();
