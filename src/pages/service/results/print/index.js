export {
  buildPrintableHtml,
  buildCustomerPrintHtml,
  buildPrintableDocumentHtml,
  buildCustomerPrintDocumentHtml,
} from "./documents.js";
export { buildPrintHeader } from "./tech.js";
export { buildCustomerHeader, buildCustomerSummary } from "./customer.js";
export {
  extractCustomerMetrics,
  separateServiceAndDiagnostic,
  buildCustomerTaskList,
  generateRecommendations,
} from "./metrics.js";
export { waitForChartsRendered } from "./dom.js";
export { PRINT_LIGHT_CSS, CUSTOMER_PRINT_CSS } from "./css.js";
