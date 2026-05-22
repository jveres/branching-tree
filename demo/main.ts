import "./styles.css";
import { startDemoShell } from "./shell";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root.");

startDemoShell(root);
