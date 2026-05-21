import { render } from "@solidjs/web";
import DemoApp from "./App";
import { startDemo } from "./controller";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root.");

render(() => <DemoApp />, root);
startDemo();
