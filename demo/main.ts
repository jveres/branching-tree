import DemoApp from "./App";
import "./styles.css";
import { startDemo } from "./controller";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root.");

DemoApp()(root);
startDemo();
