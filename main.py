import customtkinter as ctk
from src.ui import (
    scans,
    system_info,
    shortcuts,
    programs,
    stress_test,
    component_test,
    diagnostic,
    tools,
    settings,
)


class TabButton(ctk.CTkButton):
    def __init__(self, master, text, command=None):
        super().__init__(
            master=master,
            text=text,
            command=command,
            height=35,
            corner_radius=0,
            border_spacing=10,
            fg_color="transparent",
            text_color=("gray10", "gray90"),
            hover_color=("gray70", "gray30"),
        )


class AutoServiceGUI:
    def __init__(self):
        # Configure the appearance of CustomTkinter
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # Create the main window
        self.root = ctk.CTk()
        self.root.title("AutoService")
        self.root.geometry("800x600")

        # Create the tab bar container
        self.tab_bar = ctk.CTkFrame(self.root, fg_color="transparent")
        self.tab_bar.pack(fill="x", padx=0, pady=0)

        # Create the content frame
        self.content_frame = ctk.CTkFrame(self.root, fg_color="transparent")
        self.content_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        # Initialize tabs
        self.tabs = {}
        self.current_tab = None
        self.setup_tabs()

        # Show default tab
        self.show_tab("Scans")

    def setup_tabs(self):
        tab_names = [
            "Scans",
            "System Info",
            "Shortcuts",
            "Programs",
            "Stress Test",
            "Component Test",
            "Diagnostic",
            "Tools",
            "Settings",
        ]
        for i, name in enumerate(tab_names):
            btn = TabButton(
                self.tab_bar, text=name, command=lambda n=name: self.show_tab(n)
            )
            btn.pack(side="left", padx=0, pady=0)
            self.tabs[name] = self.create_tab_content(name)

    def create_tab_content(self, name):
        frame = ctk.CTkFrame(self.content_frame, fg_color="transparent")
        if name == "Scans":
            scans.init_view(frame)
        elif name == "System Info":
            system_info.init_view(frame)
        elif name == "Shortcuts":
            shortcuts.init_view(frame)
        elif name == "Programs":
            programs.init_view(frame)
        elif name == "Stress Test":
            stress_test.init_view(frame)
        elif name == "Component Test":
            component_test.init_view(frame)
        elif name == "Diagnostic":
            diagnostic.init_view(frame)
        elif name == "Tools":
            tools.init_view(frame)
        elif name == "Settings":
            settings.init_view(frame)
        return frame

    def show_tab(self, name):
        if self.current_tab:
            self.tabs[self.current_tab].pack_forget()
        self.tabs[name].pack(fill="both", expand=True, padx=0, pady=0)
        self.current_tab = name

        # Update tab button appearances
        for child in self.tab_bar.winfo_children():
            if isinstance(child, TabButton):
                if child.cget("text") == name:
                    child.configure(fg_color=("gray75", "gray25"))
                else:
                    child.configure(fg_color="transparent")

    def run(self):
        self.root.mainloop()


def main():
    app = AutoServiceGUI()
    app.run()


if __name__ == "__main__":
    main()
