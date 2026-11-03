// Os tokens do design system vivem em CSS variables (src/index.css), o que permite
// trocar tema claro/escuro sem duplicar classes "dark:" em cada componente.
const token = (name) => `var(--c-${name})`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: token("brand"),
        primary: { DEFAULT: token("primary"), hover: token("primary-hover"), on: token("on-primary") },
        ink: token("ink"),
        muted: token("muted"),
        line: token("border"),
        control: token("control-border"),
        surface: { DEFAULT: token("surface"), subtle: token("surface-subtle") },
        page: token("background"),
        selected: { DEFAULT: token("selected-bg"), ink: token("selected-ink") },
        focus: token("focus"),
        success: { DEFAULT: token("success"), bg: token("success-bg") },
        warning: { DEFAULT: token("warning"), bg: token("warning-bg") },
        danger: { DEFAULT: token("danger"), bg: token("danger-bg") },
        info: { bg: token("info-bg") },
        question: { DEFAULT: token("question-ink"), bg: token("question-bg") },
        exam: { DEFAULT: token("exam-ink"), bg: token("exam-bg") },
      },
      borderRadius: { sm2: "8px", md2: "14px" },
      boxShadow: { card: "var(--shadow-card)" },
      maxWidth: { content: "1180px" },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
