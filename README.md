# AutoService

A system maintenance and monitoring tool built with Python and ttkbootstrap.

## Features

- System scanning capabilities (Quick, Full, and Custom scans)
- Detailed system information display
- Access to common Windows system tools
- Modern and user-friendly interface

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/autoservice.git
cd autoservice
```

2. Install the required dependencies:
```bash
pip install -r requirements.txt
```

## Usage

Run the application:
```bash
python src/main.py
```

## Project Structure

```
autoservice/
├── src/
│   ├── screens/
│   │   ├── __init__.py
│   │   ├── scan_screen.py
│   │   ├── system_info_screen.py
│   │   └── tools_screen.py
│   ├── utils/
│   │   ├── __init__.py
│   │   └── system_utils.py
│   ├── __init__.py
│   ├── app.py
│   └── main.py
├── requirements.txt
└── README.md
```

## Requirements

- Python 3.7+
- Windows operating system
- Required Python packages (see requirements.txt)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
