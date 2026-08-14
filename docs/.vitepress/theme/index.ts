import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import Hero from "./components/Hero.vue";
import InstallSnippet from "./components/InstallSnippet.vue";
import FeatureList from "./components/FeatureList.vue";
import FaqRow from "./components/FaqRow.vue";
import "./vars.css";
import "./overrides.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Hero", Hero);
    app.component("InstallSnippet", InstallSnippet);
    app.component("FeatureList", FeatureList);
    app.component("FaqRow", FaqRow);
  },
} satisfies Theme;
