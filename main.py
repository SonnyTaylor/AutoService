import ttkbootstrap as tb
from src.app import AutoService

if __name__ == "__main__":
    root = tb.Window(themename="darkly")
    app = AutoService(root)
    root.mainloop()
