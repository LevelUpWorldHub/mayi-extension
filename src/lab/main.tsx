import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Lab } from "./Lab";
import "../panel/panel.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><Lab /></StrictMode>);
