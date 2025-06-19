import os
import sys
import webview
from app.system_info import SystemInfo


# API exposed to JS in the webview
class Api:
    def __init__(self):
        self.base_path = self.get_base_path()
        self.system_info = SystemInfo()  # Create an instance of SystemInfo

    def get_base_path(self):
        if getattr(sys, "frozen", False):
            # Running from compiled exe
            return os.path.dirname(sys.executable)
        else:
            # Running from script
            return os.path.dirname(os.path.abspath(__file__))

    def get_tool_path(self, tool_name):
        return os.path.join(self.base_path, "data", tool_name)

    def get_all_info(self):
        """Get all system information"""
        return self.system_info.get_all_info()

    def run_scan(self):
        # Placeholder: Replace with real scan logic using subprocess etc.
        scanner_path = self.get_tool_path("scanner1/scanner.exe")
        # You’d call subprocess here to run the scanner:
        # result = subprocess.run([scanner_path, '--scan'], capture_output=True)
        # For now, just simulate:
        return "Scan simulated. Scanner would run from:\n" + scanner_path

    def get_system_info(self):
        import platform

        return {
            "os": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "processor": platform.processor(),
        }


def start():
    api = Api()
    web_dir = os.path.join(api.get_base_path(), "web")
    index_html = os.path.join(web_dir, "index.html")
    webview.create_window("AutoService", index_html, js_api=api)
    webview.start()


if __name__ == "__main__":
    start()

    # Test the system info directly
    try:
        test_info = Api().get_all_info()
        print("System Info Test:", test_info)
    except Exception as e:
        print("Error getting system info:", str(e))
