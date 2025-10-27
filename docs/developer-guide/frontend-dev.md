# Frontend Development

Build the AutoService user interface using vanilla JavaScript and Vite.

## Project Structure

```text
src/
├── index.html              # Main entry point
├── main.js                 # Hash router and page loader
├── pages/                  # Page modules
│   ├── service/            # Service automation UI
│   ├── programs/           # Program management
│   ├── scripts/            # Script catalog
│   ├── settings/           # Configuration UI
│   ├── system-info/        # System information display
│   └── [page]/index.js     # Controller with initPage()
├── styles/                 # CSS files
│   ├── core.css            # Global styles
│   ├── service.css         # Service page styles
│   └── [page].css          # Page-specific styles
├── utils/                  # Shared utilities
│   ├── business.js         # Business settings
│   ├── tools.js            # Tool management
│   ├── reports.js          # Report utilities
│   └── [name].js           # Other utilities
└── assets/                 # Images, icons, etc.
```

## Router and Page Loading

### How the Router Works

`src/main.js` implements a hash-based router:

```javascript
// Routes to different pages
#/service         → service/presets.html
#/service-run     → service/builder.html
#/programs        → programs/index.html
#/settings        → settings/settings.html
```

### Creating a New Page

1. **Create page files:**

   ```
   src/pages/my_page/
   ├── my_page.html        # Page markup
   └── index.js            # Controller
   ```

2. **Implement controller** (`src/pages/my_page/index.js`):

   ```javascript
   export async function initPage() {
     // Initialize page
     const element = document.getElementById("my-element");
     element.addEventListener("click", handleClick);
   }
   
   function handleClick(event) {
     // Handle event
   }
   ```

3. **Register in router** - Usually automatic if following conventions

4. **Add styling** (optional):

   ```
   src/styles/my_page.css
   ```

## Frontend-Backend Communication

### Invoke Tauri Commands

Call Rust backend from frontend:

```javascript
// Basic invoke
const result = await window.__TAURI__.core.invoke("command_name");

// With parameters
const result = await window.__TAURI__.core.invoke("command_name", {
  param1: "value1",
  param2: 42
});

// Error handling
try {
  const result = await window.__TAURI__.core.invoke("command_name");
} catch (error) {
  console.error("Command failed:", error);
}
```

### Listen to Events

Receive updates from Rust backend:

```javascript
// Listen for event
window.__TAURI__.event.listen("event_name", (event) => {
  console.log("Event payload:", event.payload);
});

// Listen once
window.__TAURI__.event.once("event_name", (event) => {
  console.log("One-time event");
});

// Unlisten
const unlisten = await window.__TAURI__.event.listen("event_name", listener);
unlisten(); // Stop listening
```

## Working with Services

### Service Handler Structure

Each service has a self-contained handler:

```javascript
// src/pages/service/handlers/my_service/index.js

export const definition = {
  id: "my_service",
  label: "My Service",
  group: "Diagnostics",
  toolKeys: [],
  async build({ params, resolveToolPath, getDataDirs }) {
    // Build task definition
    return {
      type: "my_service",
      params: params
    };
  }
};

export function renderTech({ result, index }) {
  // Render technical view
  const { html } = await import('lit-html');
  return html`<div>Result: ${result.status}</div>`;
}

export function extractCustomerMetrics({ summary, status }) {
  // Extract customer-friendly metrics (optional)
  if (status !== "success") return null;
  return {
    icon: "✓",
    label: "Status",
    value: "OK"
  };
}

export const printCSS = `/* Print styles */`;
```

## Templating with lit-html

AutoService uses `lit-html` for efficient DOM updates:

```javascript
import { html } from 'lit-html';

const name = "AutoService";
const count = 42;

// Create template
const template = html`
  <div>
    <h1>${name}</h1>
    <p>Count: ${count}</p>
    ${count > 10 ? html`<span>Many items</span>` : html`<span>Few items</span>`}
  </div>
`;

// Render to element
import { render } from 'lit-html';
render(template, document.getElementById('container'));

// Event handling
const handleClick = (e) => console.log(e);
const template2 = html`
  <button @click=${handleClick}>Click me</button>
`;
```

## DOM Manipulation

Vanilla JS patterns for common tasks:

```javascript
// Query elements
const element = document.getElementById("my-id");
const elements = document.querySelectorAll(".my-class");

// Create elements
const div = document.createElement("div");
div.textContent = "Hello";
div.className = "my-class";
div.setAttribute("data-id", "123");

// Add to DOM
parent.appendChild(div);
parent.insertBefore(div, sibling);

// Remove from DOM
element.remove();
parent.removeChild(child);

// Event listeners
element.addEventListener("click", (event) => {
  console.log("Clicked!");
});

element.addEventListener("change", (event) => {
  console.log("Value:", event.target.value);
});

// Remove listeners
element.removeEventListener("click", handler);
```

## State Management

### SessionStorage (Transient)

Cleared when tab closes:

```javascript
// Save data
sessionStorage.setItem("key", JSON.stringify(data));

// Retrieve data
const data = JSON.parse(sessionStorage.getItem("key") || "null");

// Clear data
sessionStorage.removeItem("key");
```

### LocalStorage (Persistent)

Persists across sessions:

```javascript
// Save data
localStorage.setItem("key", JSON.stringify(data));

// Retrieve data
const data = JSON.parse(localStorage.getItem("key") || "null");

// Clear all
localStorage.clear();
```

## Running Services

Typical flow in service runner:

```javascript
// In runner.js
async function runQueue() {
  // Get pending tasks from sessionStorage
  const tasks = JSON.parse(sessionStorage.getItem("service.pendingRun"));
  
  // Start runner via Tauri command
  const result = await window.__TAURI__.core.invoke("start_service_run", {
    tasks: tasks
  });
  
  // Listen for progress
  window.__TAURI__.event.listen("service_runner_line", (event) => {
    const line = event.payload;
    
    // Parse task progress markers
    if (line.startsWith("TASK_START:")) {
      updateUIForTaskStart(line);
    } else if (line.startsWith("TASK_OK:")) {
      updateUIForTaskComplete(line);
    }
  });
}
```

## Working with Forms

```javascript
// Get form data
const form = document.getElementById("my-form");
const formData = new FormData(form);
const data = Object.fromEntries(formData);

// Validate and submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const data = Object.fromEntries(new FormData(form));
  
  // Validate
  if (!data.name) {
    alert("Name is required");
    return;
  }
  
  // Submit
  try {
    await window.__TAURI__.core.invoke("save_data", data);
    alert("Saved successfully!");
  } catch (error) {
    alert("Error: " + error);
  }
});
```

## Styling

### Global Styles

`src/styles/core.css` contains global styles:

```css
:root {
  --color-primary: #0066cc;
  --color-success: #00cc00;
  --color-error: #ff0000;
  --spacing-small: 4px;
  --spacing-medium: 8px;
  --spacing-large: 16px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
  background-color: #f5f5f5;
  color: #333;
}
```

### Page-Specific Styles

Create `src/styles/[page].css` for page-specific styling:

```css
.my-page {
  padding: var(--spacing-large);
}

.my-page .card {
  background: white;
  border-radius: 4px;
  padding: var(--spacing-medium);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
```

## Performance Tips

1. **Lazy load resources** - Only load code/styles for current page
2. **Minimize DOM operations** - Batch updates when possible
3. **Use event delegation** - Listen on parent instead of individual elements
4. **Cache computed values** - Don't recalculate frequently
5. **Avoid inline styles** - Use CSS classes instead

## Debugging

### Browser DevTools

1. Press `Ctrl+Shift+I` to open DevTools
2. **Console** tab for logs and errors
3. **Sources** tab for breakpoints and stepping
4. **Elements** tab for DOM inspection
5. **Network** tab for API calls (IPC)

### Common DevTools Commands

```javascript
// Log object
console.log("Value:", obj);

// Show error
console.error("Error:", err);

// Create breakpoint
debugger;

// Table view of array
console.table(array);

// Group logs
console.group("My Group");
console.log("Item 1");
console.log("Item 2");
console.groupEnd();
```

---

Next: [Backend Development](backend-dev.md)
