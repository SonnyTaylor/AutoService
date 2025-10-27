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

Call Rust backend from frontend using the Tauri IPC bridge:

=== "Basic Invoke"

    ```javascript
    const result = await window.__TAURI__.core.invoke("command_name");
    ```

=== "With Parameters"

    ```javascript
    const result = await window.__TAURI__.core.invoke("command_name", {
      param1: "value1",
      param2: 42
    });
    ```

=== "Error Handling"

    ```javascript
    try {
      const result = await window.__TAURI__.core.invoke("command_name");
    } catch (error) {
      console.error("Command failed:", error);
    }
    ```

### Listen to Events

Receive updates from Rust backend:

```javascript
// Listen for event  // (1)!
window.__TAURI__.event.listen("event_name", (event) => {
  console.log("Event payload:", event.payload);
});

// Listen once  // (2)!
window.__TAURI__.event.once("event_name", (event) => {
  console.log("One-time event");
});

// Stop listening  // (3)!
const unlisten = await window.__TAURI__.event.listen("event_name", listener);
unlisten();
```

1. Continuous listener - fires every time event is emitted
2. One-shot listener - fires only the first time
3. Call the returned function to stop listening

## Working with Services

### Service Handler Structure

Each service is a self-contained module with four optional exports:

```javascript
// src/pages/service/handlers/my_service/index.js
import { html } from 'lit-html';
import { kpiBox, buildMetric } from "../common/ui.js";

export const definition = {  // (1)!
  id: "my_service",
  label: "My Service",
  group: "Diagnostics",
  toolKeys: [],
  
  async build({ params, resolveToolPath, getDataDirs }) {  // (2)!
    return {
      type: "my_service",
      params: params
    };
  }
};

export function renderTech({ result, index }) {  // (3)!
  const { status, summary } = result;
  return html`
    <div class="card">
      <h3>My Service Result</h3>
      ${kpiBox("Status", status)}
    </div>
  `;
}

export function extractCustomerMetrics({ summary, status }) {  // (4)!
  if (status !== "success") return null;
  return buildMetric({
    icon: "✓",
    label: "Status",
    value: "OK"
  });
}

export const printCSS = `/* Print styles */`;  // (5)!
```

1. **Definition** (required) - Service metadata, UI label, dependencies, task builder
2. **Build Function** (required) - Generates JSON task sent to Python runner
3. **Technical Renderer** (required) - Renders detailed technical report view
4. **Customer Metrics** (optional) - Extracts data for customer-friendly report
5. **Print CSS** (optional) - Service-specific print styles

## Templating with lit-html

AutoService uses `lit-html` for efficient DOM updates and rendering:

```javascript
import { html, render } from 'lit-html';

const name = "AutoService";
const count = 42;

// Create template with interpolation  // (1)!
const template = html`
  <div>
    <h1>${name}</h1>
    <p>Count: ${count}</p>
    ${count > 10 ? html`<span>Many items</span>` : html`<span>Few items</span>`}
  </div>
`;

// Render to element  // (2)!
render(template, document.getElementById('container'));

// Event handling  // (3)!
const handleClick = (e) => console.log("Clicked!");
const template2 = html`
  <button @click=${handleClick}>Click me</button>
`;
```

1. Use `${}` for expressions, full HTML templates for conditional content
2. `render()` updates the DOM efficiently
3. Use `@eventName` syntax for event listeners

### Common Patterns

=== "Loops"

    ```javascript
    const items = ["Apple", "Banana", "Cherry"];
    
    const template = html`
      <ul>
        ${items.map(item => html`<li>${item}</li>`)}
      </ul>
    `;
    ```

=== "Conditionals"

    ```javascript
    const isLoading = true;
    
    const template = html`
      ${isLoading 
        ? html`<div>Loading...</div>`
        : html`<div>Loaded!</div>`
      }
    `;
    ```

=== "Class Binding"

    ```javascript
    const isActive = true;
    
    const template = html`
      <div class=${"item " + (isActive ? "active" : "")}>
        Content
      </div>
    `;
    ```

## DOM Manipulation

Vanilla JS patterns for common tasks:

=== "Query Elements"

    ```javascript
    const element = document.getElementById("my-id");  // (1)!
    const elements = document.querySelectorAll(".my-class");  // (2)!
    const first = document.querySelector(".my-class");  // (3)!
    ```

    1. Get single element by ID
    2. Get all matching elements as NodeList
    3. Get first matching element

=== "Create & Modify"

    ```javascript
    const div = document.createElement("div");  // (1)!
    div.textContent = "Hello";
    div.className = "my-class";
    div.setAttribute("data-id", "123");  // (2)!
    div.style.color = "red";  // (3)!
    ```

    1. Create new DOM element
    2. Set custom attributes
    3. Apply inline styles

=== "Add/Remove from DOM"

    ```javascript
    parent.appendChild(div);  // (1)!
    parent.insertBefore(div, sibling);  // (2)!
    element.remove();  // (3)!
    parent.removeChild(child);
    ```

    1. Add to end of parent
    2. Insert before specific sibling
    3. Remove element from DOM

=== "Event Listeners"

    ```javascript
    // Add listener  // (1)!
    element.addEventListener("click", (event) => {
      console.log("Clicked!");
    });

    // Input change  // (2)!
    input.addEventListener("change", (event) => {
      console.log("Value:", event.target.value);
    });

    // Remove listener  // (3)!
    element.removeEventListener("click", handler);
    ```

    1. Click events
    2. Input value changes  
    3. Stop listening to events

## State Management

### SessionStorage (Transient)

Cleared when tab closes - perfect for runtime data like pending runs and reports:

```javascript
// Save data  // (1)!
sessionStorage.setItem("service.pendingRun", JSON.stringify(taskQueue));

// Retrieve data  // (2)!
const taskQueue = JSON.parse(sessionStorage.getItem("service.pendingRun") || "null");

// Clear data  // (3)!
sessionStorage.removeItem("service.pendingRun");
```

1. Store any JSON-serializable data
2. Parse string back to JavaScript object - use default `"null"` to prevent parsing errors
3. Delete a specific key

### LocalStorage (Persistent)

Persists across sessions - for user preferences and fallback report storage:

```javascript
// Save data
localStorage.setItem("app.settings", JSON.stringify(settings));

// Retrieve data
const settings = JSON.parse(localStorage.getItem("app.settings") || "null");

// Clear all
localStorage.clear();
```

!!! tip "Storage Keys in AutoService"
    The app uses these standard keys:
    
    === "SessionStorage Keys"
        - `service.pendingRun` - Queued tasks
        - `service.finalReport` - Completed run results
        - `tool.statuses.v1` - Cached tool availability
    
    === "LocalStorage Keys"
        - `service.finalReport` - Backup report storage
        - Business settings and app configuration

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
