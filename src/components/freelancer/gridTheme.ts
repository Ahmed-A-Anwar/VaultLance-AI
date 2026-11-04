/* gridTheme.ts — one AG Grid theme for both freelancer ledgers: 34px rows, mono
   headers, steel hairlines, no default blue. */
import { themeQuartz } from "ag-grid-community";

export const gridTheme = themeQuartz.withParams({
  backgroundColor: "transparent",
  foregroundColor: "#0e1520",
  borderColor: "rgba(138, 149, 161, 0.4)",
  headerBackgroundColor: "transparent",
  headerTextColor: "#4b5663",
  chromeBackgroundColor: "transparent",
  accentColor: "#12a5b5",
  fontFamily: "var(--hero-font-body)",
  fontSize: "14px",
  headerHeight: 34,
  rowHeight: 34,
  cellHorizontalPadding: 8,
  wrapperBorder: false,
});
