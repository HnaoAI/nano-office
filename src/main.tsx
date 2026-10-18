// Point d'entrée de l'application : monte le composant React racine dans la page.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Élément #root introuvable dans index.html");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
