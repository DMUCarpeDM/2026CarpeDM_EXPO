import React, { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

function AppMotion() {
  useEffect(() => {
    const keyboard = () => { document.documentElement.dataset.input = "keyboard"; };
    const pointer = () => { delete document.documentElement.dataset.input; };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
      delete document.documentElement.dataset.input;
    };
  }, []);
  return <MotionConfig reducedMotion="user"><App /></MotionConfig>;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppMotion />
  </React.StrictMode>,
);
