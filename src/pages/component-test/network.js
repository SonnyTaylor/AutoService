/**
 * Network testing functionality
 * @module network
 */

import { qs, supportsAPI } from './utils.js';

/**
 * Network test state
 * @type {Object}
 */
let networkState = {
  // DOM elements
  netBtn: null,
  netBtnExt: null,
  netStatus: null,
  netInfo: null,
  netResults: null,
  netHealth: null,
  netSummary: null,
  kpiMed: null,
  kpiAvg: null,
  kpiLoss: null,
  kpiDl: null,

  // Test URLs
  testUrls: [
    'https://cloudflare.com/cdn-cgi/trace',
    'https://www.google.com/generate_204',
    'https://httpbin.org/get',
  ]
};

/**
 * Initialize network testing functionality
 * Sets up DOM elements and event listeners
 */
export function initNetwork() {
  if (!supportsAPI('webSocket')) {
    console.warn('WebSocket not supported - some network tests may be limited');
  }

  // Get DOM elements
  networkState.netBtn = qs('#network-quick');
  networkState.netBtnExt = qs('#network-extended');
  networkState.netStatus = qs('#network-status');
  networkState.netInfo = qs('#network-info');
  networkState.netResults = qs('#network-results');
  networkState.netHealth = qs('#network-health');
  networkState.netSummary = qs('#network-summary');
  networkState.kpiMed = qs('#net-kpi-med');
  networkState.kpiAvg = qs('#net-kpi-avg');
  networkState.kpiLoss = qs('#net-kpi-loss');
  networkState.kpiDl = qs('#net-kpi-dl');

  // Set up event listeners
  networkState.netBtn?.addEventListener('click', runQuickTest);
  networkState.netBtnExt?.addEventListener('click', runExtendedTest);
}

/**
 * Run quick network test
 * Tests basic connectivity, latency, and WebSocket support
 */
async function runQuickTest() {
  if (!networkState.netBtn || !networkState.netStatus) return;

  // Disable buttons during test
  networkState.netBtn.disabled = true;
  if (networkState.netBtnExt) networkState.netBtnExt.disabled = true;

  try {
    await performNetworkTest(false);
  } finally {
    // Re-enable buttons
    networkState.netBtn.disabled = false;
    if (networkState.netBtnExt) networkState.netBtnExt.disabled = false;
  }
}

/**
 * Run extended network test
 * Includes quick test plus multi-sample latency and throughput test
 */
async function runExtendedTest() {
  if (!networkState.netBtnExt) return;

  // Disable buttons during test
  networkState.netBtnExt.disabled = true;
  if (networkState.netBtn) networkState.netBtn.disabled = true;

  try {
    // Run quick test first
    await performNetworkTest(false);

    // Add extended test results
    addExtendedTestHeader();

    // Run extended tests
    await performExtendedTests();

  } finally {
    // Re-enable buttons
    networkState.netBtnExt.disabled = false;
    if (networkState.netBtn) networkState.netBtn.disabled = false;
  }
}

/**
 * Perform the main network test
 * @param {boolean} isExtended - Whether this is an extended test
 */
async function performNetworkTest(isExtended) {
  if (!networkState.netStatus) return;

  // Clear UI and mark as running
  networkState.netStatus.textContent = 'Running…';
  networkState.netStatus.className = 'badge info';

  if (networkState.netInfo) networkState.netInfo.innerHTML = '';
  if (networkState.netResults) networkState.netResults.innerHTML = '';
  if (networkState.netHealth) {
    networkState.netHealth.textContent = 'Testing…';
    networkState.netHealth.className = 'badge';
  }
  if (networkState.netSummary) networkState.netSummary.textContent = '';

  // Display connection info
  displayConnectionInfo();

  // Perform connectivity tests
  const testResults = await performConnectivityTests();

  // Perform DNS test and include in aggregates
  const dns = await performDNSTest();
  testResults.timings.push(dns.t);
  if (dns.ok) testResults.successTimes.push(dns.t);
  if (dns.ok) testResults.successCount++;

  // Perform WebSocket test and include in aggregates
  const ws = await performWebSocketTest();
  // Compute total checks dynamically (3 HTTP + DNS + WS if supported)
  const baseHttpCount = networkState.testUrls.length;
  testResults.totalChecks = baseHttpCount + 1 /* DNS */ + (ws.supported ? 1 : 0);
  if (ws.t > 0) testResults.timings.push(ws.t);
  if (ws.ok) {
    testResults.successTimes.push(ws.t);
    testResults.successCount++;
  }

  // Calculate and display results
  displayTestResults(testResults, isExtended);
}

/**
 * Display connection information
 */
function displayConnectionInfo() {
  if (!networkState.netInfo) return;

  const items = [];
  items.push(['User Agent', navigator.userAgent]);

  if ('connection' in navigator) {
    const c = navigator.connection;
    items.push(['Downlink (Mb/s)', c.downlink]);
    items.push(['Effective Type', c.effectiveType]);
    items.push(['RTT (ms)', c.rtt]);
  }

  items.push(['Online', String(navigator.onLine)]);

  items.forEach(([key, value]) => {
    const li = document.createElement('li');
    li.textContent = `${key}: ${value}`;
    networkState.netInfo.appendChild(li);
  });
}

/**
 * Perform connectivity tests to various endpoints
 * @returns {Object} Test results
 */
async function performConnectivityTests() {
  const timings = []; // All timings (success/fail)
  const successTimes = []; // Only successful request times
  let successCount = 0;

  // Test each URL
  for (const url of networkState.testUrls) {
    const li = document.createElement('li');
    li.textContent = `GET ${url} …`;
    networkState.netResults.appendChild(li);

    const t0 = performance.now();
    try {
      await fetch(url, { cache: 'no-store', mode: 'no-cors' });
      const t = Math.round(performance.now() - t0);
      timings.push(t);
      successTimes.push(t);
      successCount++;

      li.textContent = `GET ${url} → OK (${t} ms)`;
      li.classList.add('pass');
    } catch (error) {
      const t = Math.round(performance.now() - t0);
      timings.push(t);

      li.textContent = `GET ${url} → FAIL (${t} ms): ${error.message}`;
      li.classList.add('fail');
    }
  }

  return { timings, successTimes, successCount };
}

/**
 * Perform DNS resolution test
 * @param {Array} timings - All timing results
 * @param {Array} successTimes - Successful timing results
 * @param {number} successCount - Count of successful tests
 */
async function performDNSTest() {
  const dnsUrl = 'https://i.imgur.com/favicon.ico';
  const li = document.createElement('li');
  li.textContent = `DNS check ${dnsUrl} …`;
  networkState.netResults.appendChild(li);

  const t0 = performance.now();
  try {
    await fetch(dnsUrl, { cache: 'no-store', mode: 'no-cors' });
    const t = Math.round(performance.now() - t0);
    li.textContent = `DNS ${dnsUrl} → OK (${t} ms)`;
    li.classList.add('pass');
    return { ok: true, t };
  } catch (error) {
    const t = Math.round(performance.now() - t0);
    li.textContent = `DNS ${dnsUrl} → FAIL (${t} ms): ${error.message}`;
    li.classList.add('fail');
    return { ok: false, t };
  }
}

/**
 * Perform WebSocket connectivity test
 * @returns {Promise} WebSocket test promise
 */
async function performWebSocketTest() {
  return new Promise((resolve) => {
    const li = document.createElement('li');
    li.textContent = 'WebSocket echo …';
    networkState.netResults.appendChild(li);

    let settled = false;

    try {
      const ws = new WebSocket('wss://ws.postman-echo.com/raw');
      const t0 = performance.now();

      ws.onopen = () => {
        ws.send('ping');
      };

      ws.onmessage = () => {
        const t = Math.round(performance.now() - t0);
        li.textContent = `WebSocket → OK (${t} ms)`;
        li.classList.add('pass');
        settled = true;
        ws.close();
        resolve({ ok: true, t, supported: true });
      };

      ws.onerror = () => {
        const t = Math.round(performance.now() - t0);
        li.textContent = `WebSocket → FAIL (${t} ms)`;
        li.classList.add('fail');
        if (!settled) {
          settled = true;
          resolve({ ok: false, t, supported: true });
        }
      };
    } catch (error) {
      li.textContent = `WebSocket → Not supported: ${error.message}`;
      li.classList.add('note');
      resolve({ ok: false, t: 0, supported: false });
    }

    // Timeout after 4 seconds
    setTimeout(() => {
      if (!settled) {
        li.textContent = 'WebSocket → TIMEOUT';
        resolve({ ok: false, t: 4000, supported: true });
      }
    }, 4000);
  });
}

/**
 * Display test results and calculate health score
 * @param {Object} results - Test results
 * @param {boolean} isExtended - Whether this is extended test
 */
function displayTestResults(results, isExtended) {
  const { successTimes, successCount } = results;
  const total = results.totalChecks ?? (networkState.testUrls.length + 2); // + DNS + WebSocket

  // Calculate statistics
  const avg = successTimes.length
    ? Math.round(successTimes.reduce((a, b) => a + b, 0) / successTimes.length)
    : 0;

  const median = calculateMedian(successTimes);
  const online = navigator.onLine;

  // Determine health grade
  let grade = 'Unknown';
  let cls = 'badge';

  if (!online || successCount === 0) {
    grade = 'Poor';
    cls += ' warn';
  } else if (successCount === total && median <= 200) {
    grade = 'Good';
    cls += ' ok';
  } else if (successCount >= Math.ceil(total * 0.6) && median <= 450) {
    grade = 'Fair';
  } else if (successCount === total && median > 450) {
    grade = 'Fair'; // All passed but slow
  } else {
    grade = 'Poor';
    cls += ' warn';
  }

  // Update UI
  if (networkState.netHealth) {
    networkState.netHealth.textContent = grade;
    networkState.netHealth.className = cls;
  }

  if (networkState.netSummary) {
    networkState.netSummary.textContent = `${successCount}/${total} checks passed • median ${median} ms, avg ${avg} ms`;
  }

  // Update KPIs
  if (networkState.kpiMed) networkState.kpiMed.textContent = `${median} ms`;
  if (networkState.kpiAvg) networkState.kpiAvg.textContent = `${avg} ms`;
  if (networkState.kpiLoss) {
    networkState.kpiLoss.textContent = `${Math.max(0, Math.round(100 - (successCount / total) * 100))}%`;
  }

  // Final status update
  updateFinalStatus(successCount, total, isExtended);
}

/**
 * Calculate median of an array
 * @param {Array} arr - Array of numbers
 * @returns {number} Median value
 */
function calculateMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Update final test status
 * @param {number} successCount - Number of successful tests
 * @param {number} total - Total number of tests
 * @param {boolean} isExtended - Whether this is extended test
 */
function updateFinalStatus(successCount, total, isExtended) {
  if (!networkState.netStatus) return;

  if (successCount === total) {
    networkState.netStatus.textContent = 'Completed: All checks passed';
    networkState.netStatus.className = 'badge ok';
  } else if (successCount > 0) {
    networkState.netStatus.textContent = `Completed: ${total - successCount} failed`;
    networkState.netStatus.className = 'badge warn';
  } else {
    networkState.netStatus.textContent = 'Completed: All checks failed';
    networkState.netStatus.className = 'badge error';
  }
}

/**
 * Add extended test header to results
 */
function addExtendedTestHeader() {
  const header = document.createElement('li');
  header.textContent = '--- Extended ---';
  networkState.netResults.appendChild(header);
}

/**
 * Perform extended network tests
 * Includes multi-sample latency and throughput tests
 */
async function performExtendedTests() {
  await performMultiSampleLatencyTest();
  await performThroughputTest();
}

/**
 * Perform multi-sample latency test
 */
async function performMultiSampleLatencyTest() {
  const url = 'https://www.google.com/generate_204';
  const samples = 5;
  const times = [];

  for (let i = 0; i < samples; i++) {
    const li = document.createElement('li');
    li.textContent = `Sample ${i + 1}/${samples} …`;
    networkState.netResults.appendChild(li);

    const t0 = performance.now();
    try {
      await fetch(url, { cache: 'no-store', mode: 'no-cors' });
      const t = Math.round(performance.now() - t0);
      times.push(t);

      li.textContent = `Sample ${i + 1} → ${t} ms`;
      li.classList.add('pass');
    } catch (error) {
      const t = Math.round(performance.now() - t0);
      times.push(t);

      li.textContent = `Sample ${i + 1} → FAIL (${t} ms)`;
      li.classList.add('fail');
    }
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const liAvg = document.createElement('li');
  liAvg.textContent = `Avg latency over ${samples} samples: ${avg} ms`;
  networkState.netResults.appendChild(liAvg);
}

/**
 * Perform throughput test
 */
async function performThroughputTest() {
  const dlLi = document.createElement('li');
  networkState.netResults.appendChild(dlLi);

  try {
    const dlUrl = 'https://speed.cloudflare.com/__down?bytes=100000';
    const t0 = performance.now();

    const res = await fetch(dlUrl, { cache: 'no-store' });
    const buf = await res.arrayBuffer();

    const dt = (performance.now() - t0) / 1000;
    const mbps = (buf.byteLength * 8) / 1_000_000 / dt;

    dlLi.textContent = `Throughput sample: ${mbps.toFixed(2)} Mb/s`;
    dlLi.classList.add('pass');

    if (networkState.kpiDl) {
      networkState.kpiDl.textContent = `${mbps.toFixed(2)} Mb/s`;
    }
  } catch (error) {
    dlLi.textContent = `Throughput sample: FAIL (${error.message})`;
    dlLi.classList.add('fail');
  }
}

/**
 * Clean up network resources
 * Should be called when leaving the page
 */
export function cleanupNetwork() {
  // No specific cleanup needed for network tests
}
