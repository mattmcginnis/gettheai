import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17211f",
        paper: "#fbfaf7",
        line: "#d9ded8",
        mint: "#0f8f6f",
        gold: "#c68421",
        coral: "#d45b47",
        sky: "#3178c6"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(23, 33, 31, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
