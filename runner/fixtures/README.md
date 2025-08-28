This folder contains JSON fixtures used by local testing of the runner tasks.

Security guidance:

- Do NOT commit real API keys to version control.
- Fixtures reference an environment-backed token: set the environment variable `AUTOSERVICE_OPENAI_KEY` before running tests that call the AI service.

The service `runner/services/ai_startup_service.py` will accept:

- a task `api_key` value of the form `env:VARNAME` to read a specific env var, or
- if no `api_key` is provided, it will fall back to `AUTOSERVICE_OPENAI_KEY` or `OPENAI_API_KEY`.
