import customtkinter as ctk
from typing import Optional
from ..core.scans import ScansManager


class SelectableRow(ctk.CTkFrame):
    """A single selectable row with a title, bullet points, and an ETA text."""

    def __init__(self, master, text: str, eta: str, on_select):
        super().__init__(master)
        self._text = text
        self._eta = eta
        self._on_select = on_select
        self._selected = False

        # Layout - configure to expand fully
        self.grid_rowconfigure(0, weight=0)  # Title row
        self.grid_rowconfigure(1, weight=1)  # Bullet points row
        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=0)

        # Header with title and ETA
        header_frame = ctk.CTkFrame(self, fg_color="transparent")
        header_frame.grid(
            row=0, column=0, columnspan=2, sticky="ew", padx=16, pady=(12, 8)
        )
        header_frame.grid_columnconfigure(0, weight=1)

        self.title = ctk.CTkLabel(
            header_frame,
            text=text,
            anchor="w",
            font=ctk.CTkFont(size=18, weight="bold"),
        )
        self.title.grid(row=0, column=0, sticky="w")

        self.eta = ctk.CTkLabel(
            header_frame, text=eta, anchor="e", font=ctk.CTkFont(size=14)
        )
        self.eta.grid(row=0, column=1, sticky="e", padx=(8, 0))

        # Bullet points
        bullet_frame = ctk.CTkFrame(self, fg_color="transparent")
        bullet_frame.grid(
            row=1, column=0, columnspan=2, sticky="nsew", padx=32, pady=(0, 12)
        )

        # Example bullet points (placeholder)
        bullets = [
            "• Placeholder feature 1",
            "• Placeholder feature 2",
            "• Placeholder feature 3",
        ]

        for i, bullet in enumerate(bullets):
            label = ctk.CTkLabel(
                bullet_frame, text=bullet, anchor="w", font=ctk.CTkFont(size=14)
            )
            label.pack(anchor="w", pady=2)

        # Click handling
        for w in (self, self.title, self.eta, bullet_frame):
            w.bind("<Button-1>", lambda _e: self._on_click())

        # Initial style
        self.configure(corner_radius=0)
        self.set_selected(False)

    def set_selected(self, value: bool):
        self._selected = value
        if value:
            self.configure(fg_color=("#cfe3ff", "#2a3b55"))
        else:
            self.configure(fg_color=("#eeeeee", "#1f1f1f"))

    def _on_click(self):
        if callable(self._on_select):
            self._on_select(self._text)


class ScansView:
    """Implements the Scans tab UI and simple navigation to a start screen."""

    def __init__(self, frame):
        self.frame = frame
        self.manager = ScansManager()
        self.rows: list[SelectableRow] = []
        self.selected_text: Optional[str] = None

        self._build_main()

    def _build_main(self):
        # Clear frame and reset state
        for w in self.frame.winfo_children():
            w.destroy()
        self.rows = []  # Clear the rows list

        # Configure frame grid weights
        self.frame.grid_rowconfigure(0, weight=1)  # Header row takes 1 part
        self.frame.grid_rowconfigure(1, weight=3)  # Body row takes 3 parts
        self.frame.grid_columnconfigure(0, weight=1)

        # Header
        header = ctk.CTkFrame(self.frame, fg_color="transparent")
        header.grid(row=0, column=0, sticky="nsew", padx=20, pady=(20, 0))
        header.grid_columnconfigure(0, weight=1)
        header.grid_columnconfigure(1, weight=0)

        # Make header elements scale with the window
        header.grid_rowconfigure(0, weight=1)

        title_label = ctk.CTkLabel(
            header, text="Scans", font=ctk.CTkFont(size=48, weight="bold"), anchor="w"
        )
        title_label.grid(row=0, column=0, sticky="nsew")

        self.start_btn = ctk.CTkButton(
            header,
            text="Start",
            width=200,
            height=60,
            font=ctk.CTkFont(size=20),
            command=self._go_next,
        )
        self.start_btn.grid(row=0, column=1, padx=20)
        self._refresh_start_state()

        # Body list with 3 rows separated by thin borders
        container = ctk.CTkFrame(self.frame, fg_color="transparent")
        container.grid(row=1, column=0, sticky="nsew", padx=10, pady=10)
        container.grid_rowconfigure(0, weight=1)
        container.grid_columnconfigure(0, weight=1)

        def add_divider(parent):
            divider = ctk.CTkFrame(parent, height=2)
            divider.grid(sticky="ew", columnspan=2)

        # Row items as per reference
        items = [
            ("General Service", "20-30+ Mins"),
            ("Complete General Service", "30-45+ Mins"),
            ("Custom Service", "N/A Mins"),
        ]

        list_frame = ctk.CTkFrame(container)
        list_frame.grid(row=0, column=0, sticky="nsew")
        list_frame.grid_columnconfigure(0, weight=1)

        # Configure rows to expand evenly
        total_rows = len(items) * 2 - 1  # Including dividers
        for i in range(total_rows):
            list_frame.grid_rowconfigure(
                i, weight=1 if i % 2 == 0 else 0
            )  # Give weight to rows, not dividers

        for idx, (label, eta) in enumerate(items):
            if idx > 0:
                add_divider(list_frame)
            row = SelectableRow(list_frame, label, eta, self._select)
            row.grid(
                row=idx * 2, column=0, sticky="nsew"
            )  # Use idx * 2 to account for dividers
            self.rows.append(row)

        # Bottom divider for visual closure
        add_divider(list_frame)

    def _select(self, text: str):
        self.selected_text = text
        self.manager.select_option(text)
        for r in self.rows:
            r.set_selected(r._text == text)
        self._refresh_start_state()

    def _refresh_start_state(self):
        enabled = self.manager.can_start()
        self.start_btn.configure(state=("normal" if enabled else "disabled"))

    def _go_next(self):
        if not self.manager.can_start():
            return
        session = self.manager.start()
        self._build_start_screen(session.option)

    def _build_start_screen(self, option: str):
        # Simple placeholder next view which shows the selection
        for w in self.frame.winfo_children():
            w.destroy()

        wrap = ctk.CTkFrame(self.frame)
        wrap.pack(fill="both", expand=True, padx=20, pady=20)

        ctk.CTkLabel(
            wrap,
            text="Starting Service",
            font=ctk.CTkFont(size=26, weight="bold"),
        ).pack(pady=(10, 20))

        ctk.CTkLabel(
            wrap,
            text=f"Selected: {option}",
            font=ctk.CTkFont(size=16),
        ).pack(pady=(0, 20))

        ctk.CTkButton(
            wrap,
            text="Back",
            command=self._build_main,
            width=120,
        ).pack(pady=10)


def init_view(frame):
    """Initialize the Scans view"""
    ScansView(frame)
