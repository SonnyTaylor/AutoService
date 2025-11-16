"""Unified AI utilities using LiteLLM for multi-provider support.

This module provides a centralized interface for AI operations across all AutoService
services, using LiteLLM to support multiple AI providers (OpenAI, Anthropic, etc.)
while maintaining backward compatibility with existing OpenAI-based implementations.

Features:
- Multi-provider support via LiteLLM (OpenAI, Anthropic, Azure, Groq, etc.)
- Backward compatibility with existing OPENAI_API_KEY environment variable
- Unified error handling and logging
- Sentry integration for tracking AI usage and errors
- Configurable timeouts and retry logic
- JSON response parsing with fallback handling
"""

import json
import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# SSL Certificate initialization for PyInstaller bundles
# Ensure SSL certificates are available for network requests
def _ensure_ssl_certificates():
    """Ensure SSL certificates are configured for network requests.
    
    This is especially important when running as a PyInstaller bundle,
    where certificate paths need to be explicitly set.
    """
    try:
        # Check if we're running as a PyInstaller bundle
        if getattr(sys, 'frozen', False):
            # Try to use certifi if available
            try:
                import certifi
                cert_path = certifi.where()
                # Set environment variables that requests/urllib3 will use
                if 'REQUESTS_CA_BUNDLE' not in os.environ:
                    os.environ['REQUESTS_CA_BUNDLE'] = cert_path
                if 'SSL_CERT_FILE' not in os.environ:
                    os.environ['SSL_CERT_FILE'] = cert_path
            except ImportError:
                pass
    except Exception:
        pass

# Initialize SSL certificates early
_ensure_ssl_certificates()

# Sentry integration
try:
    from sentry_config import add_breadcrumb

    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

    def add_breadcrumb(*args, **kwargs):
        pass


# Try to import LiteLLM
try:
    import litellm

    LITELLM_AVAILABLE = True
    logger.debug("LiteLLM is available")
except ImportError:
    LITELLM_AVAILABLE = False
    logger.warning(
        "LiteLLM not available - falling back to requests library for OpenAI only"
    )

# Fallback to requests if LiteLLM is not available
if not LITELLM_AVAILABLE:
    try:
        import requests

        REQUESTS_AVAILABLE = True
    except ImportError:
        REQUESTS_AVAILABLE = False
        logger.warning("Neither LiteLLM nor requests available - AI features disabled")


class AIClient:
    """Unified AI client supporting multiple providers via LiteLLM."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = 120,
    ):
        """Initialize AI client.

        Args:
            api_key: API key for the provider. If None, reads from environment.
            model: Model name (e.g., "gpt-5", "gpt-4o", "claude-sonnet-4-20250514").
                   If None, defaults to "gpt-4o-mini".
            base_url: Base URL for API endpoint. Only used for fallback mode.
            timeout: Request timeout in seconds (default: 120)

        Note:
            For backward compatibility, if no explicit provider is specified,
            the client will look for OPENAI_API_KEY and use OpenAI.
        """
        self.timeout = timeout
        self.base_url = base_url

        # Determine API key and model
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or "gpt-4o-mini"

        # Set up LiteLLM if available
        if LITELLM_AVAILABLE:
            # Configure LiteLLM logging (reduce verbosity)
            litellm.suppress_debug_info = True

            # Normalize model name for LiteLLM
            # If model doesn't have a provider prefix, assume OpenAI
            if "/" not in self.model:
                self.model = f"openai/{self.model}"

            # Set API key in environment for LiteLLM
            # LiteLLM reads from environment variables based on provider
            provider_prefix = self.model.split("/")[0].lower()

            # Map providers to their environment variable names
            provider_env_map = {
                "openai": "OPENAI_API_KEY",
                "anthropic": "ANTHROPIC_API_KEY",
                "groq": "GROQ_API_KEY",
                "xai": "XAI_API_KEY",
                "google": "GOOGLE_API_KEY",  # Also supports GEMINI_API_KEY
                "azure": "AZURE_API_KEY",
                "ollama": None,  # Ollama doesn't use API keys
            }

            # Set the appropriate environment variable
            env_var = provider_env_map.get(provider_prefix)
            if env_var and self.api_key:
                os.environ[env_var] = self.api_key
            elif provider_prefix == "google" and self.api_key:
                # Google also accepts GEMINI_API_KEY
                os.environ["GEMINI_API_KEY"] = self.api_key

            # Handle Ollama base_url (default to localhost if not provided)
            if provider_prefix == "ollama":
                if not self.base_url:
                    self.base_url = "http://localhost:11434"
                # Ollama doesn't need API key, but we set a dummy if needed for LiteLLM
                if not self.api_key:
                    self.api_key = "ollama"  # LiteLLM may check for key presence

            logger.info(
                f"Initialized AI client with LiteLLM, model: {self.model}, provider: {provider_prefix}"
            )
        else:
            logger.info(
                f"Initialized AI client with requests fallback, model: {self.model}"
            )

        add_breadcrumb(
            "AI client initialized",
            category="ai",
            level="info",
            data={"model": self.model, "has_key": bool(self.api_key)},
        )

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
        json_mode: bool = True,
    ) -> Dict[str, Any]:
        """Call chat completion API with unified interface.

        Args:
            messages: List of message dicts with 'role' and 'content' keys
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate (None for default)
            json_mode: Whether to request JSON formatted output

        Returns:
            Dict with keys:
                - success: bool - Whether the request succeeded
                - data: str - The response content (if success=True)
                - usage: dict - Token usage information (if available)
                - error: str - Error message (if success=False)
        """
        # Check if API key is required (Ollama doesn't need one)
        # Determine provider from model name (may have been normalized in __init__)
        if "/" in self.model:
            provider = self.model.split("/")[0].lower()
        else:
            provider = "openai"  # Default if no prefix

        if provider != "ollama" and not self.api_key:
            return {
                "success": False,
                "error": f"No API key configured for provider '{provider}'. Please set the API key in settings.",
            }

        add_breadcrumb(
            "Starting AI chat completion",
            category="ai",
            level="info",
            data={
                "model": self.model,
                "message_count": len(messages),
                "temperature": temperature,
                "json_mode": json_mode,
            },
        )

        try:
            if LITELLM_AVAILABLE:
                return self._litellm_completion(
                    messages, temperature, max_tokens, json_mode
                )
            elif REQUESTS_AVAILABLE:
                return self._requests_fallback(
                    messages, temperature, max_tokens, json_mode
                )
            else:
                return {
                    "success": False,
                    "error": "No AI library available (neither LiteLLM nor requests)",
                }
        except Exception as e:
            logger.error(f"AI completion failed: {e}")
            add_breadcrumb(
                "AI completion failed",
                category="ai",
                level="error",
                data={"error": str(e)},
            )
            return {"success": False, "error": f"AI request failed: {str(e)}"}

    def _litellm_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: Optional[int],
        json_mode: bool,
    ) -> Dict[str, Any]:
        """Use LiteLLM for completion (multi-provider support)."""
        try:
            provider = self.model.split("/")[0].lower()

            kwargs = {
                "model": self.model,  # Keep full model name with provider prefix for LiteLLM
                "messages": messages,
                "temperature": temperature,
                "timeout": self.timeout,
            }

            # Handle base_url for providers that need it (Ollama, Azure, custom endpoints)
            if self.base_url:
                # Validate that base_url is a valid URL (not a file path)
                base_url_clean = self.base_url.strip().rstrip("/")
                if base_url_clean:
                    try:
                        parsed = urlparse(base_url_clean)
                        # Check if it looks like a valid URL
                        if parsed.scheme in ("http", "https"):
                            # Valid URL with scheme
                            kwargs["api_base"] = base_url_clean
                        elif not parsed.scheme and "://" not in base_url_clean:
                            # No scheme - might be hostname:port format
                            # Check if it looks like a file path (has backslashes or starts with drive letter)
                            if "\\" in base_url_clean or (
                                len(base_url_clean) >= 2
                                and base_url_clean[1] == ":"
                                and base_url_clean[0].isalpha()
                            ):
                                # Looks like a Windows file path (e.g., "C:\path" or "F:\path")
                                logger.warning(
                                    f"Invalid base_url format (looks like file path): {self.base_url}. Skipping api_base."
                                )
                                sys.stderr.flush()
                            else:
                                # Looks like hostname:port, add http://
                                kwargs["api_base"] = f"http://{base_url_clean}"
                        else:
                            # Has "://" but invalid scheme, or other invalid format
                            logger.warning(
                                f"Invalid base_url format: {self.base_url}. Skipping api_base."
                            )
                            sys.stderr.flush()
                    except Exception as e:
                        logger.warning(
                            f"Failed to parse base_url '{self.base_url}': {e}. Skipping api_base."
                        )
                        sys.stderr.flush()
            elif provider == "ollama":
                # Ollama should always have a base_url (defaults to localhost:11434)
                # If somehow it's None, set it now
                kwargs["api_base"] = "http://localhost:11434"

            if max_tokens is not None:
                kwargs["max_tokens"] = max_tokens

            # Enable JSON mode if requested (provider-specific handling)
            if json_mode:
                if provider == "ollama":
                    # Ollama uses format="json" parameter, not response_format
                    kwargs["format"] = "json"
                elif provider in ["openai", "azure"]:
                    kwargs["response_format"] = {"type": "json_object"}
                elif provider == "anthropic":
                    # Anthropic supports structured outputs, but we'll use system prompt for now
                    # Add instruction to system message if not already present
                    system_msg = next(
                        (m for m in messages if m.get("role") == "system"), None
                    )
                    if system_msg and "JSON" not in system_msg.get("content", ""):
                        system_msg["content"] += (
                            "\n\nIMPORTANT: You must respond with valid JSON only, no additional text."
                        )
                # For other providers, rely on system messages to request JSON

            logger.info(
                f"Calling LiteLLM with model: {self.model}, api_base: {kwargs.get('api_base', 'default')}, provider: {provider}"
            )
            sys.stderr.flush()

            try:
                response = litellm.completion(**kwargs)
            except OSError as e:
                # OSError with errno 22 often indicates invalid argument (e.g., bad URL, file path instead of URL)
                error_msg = str(e)
                if "api_base" in kwargs:
                    logger.error(
                        f"LiteLLM OSError (likely invalid api_base URL): {error_msg}. "
                        f"api_base was: {kwargs.get('api_base')}"
                    )
                    sys.stderr.flush()
                    # Try again without api_base if it was set
                    logger.info("Retrying without api_base parameter")
                    sys.stderr.flush()
                    kwargs.pop("api_base", None)
                    response = litellm.completion(**kwargs)
                else:
                    raise

            # Extract content from response
            content = response.choices[0].message.content

            # Extract usage information
            usage_info = {}
            if hasattr(response, "usage") and response.usage:
                usage_info = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                }

            logger.info(
                f"LiteLLM completion successful. Tokens: {usage_info.get('total_tokens', 'unknown')}"
            )
            sys.stderr.flush()

            return {"success": True, "data": content, "usage": usage_info}

        except Exception as e:
            logger.error(f"LiteLLM completion error: {e}")
            sys.stderr.flush()
            return {"success": False, "error": f"LiteLLM error: {str(e)}"}

    def _requests_fallback(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: Optional[int],
        json_mode: bool,
    ) -> Dict[str, Any]:
        """Fallback to requests library for OpenAI-compatible endpoints."""
        if not REQUESTS_AVAILABLE:
            return {"success": False, "error": "requests library not available"}

        # Only support OpenAI in fallback mode
        url = (self.base_url or "https://api.openai.com/v1").rstrip(
            "/"
        ) + "/chat/completions"

        payload = {
            "model": self.model.replace("openai/", ""),  # Remove provider prefix
            "messages": messages,
            "temperature": temperature,
        }

        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        logger.info(f"Calling OpenAI API via requests: {url}")
        sys.stderr.flush()

        try:
            response = requests.post(
                url, headers=headers, json=payload, timeout=self.timeout
            )

            if not response.ok:
                error_detail = (
                    response.text[:2000]
                    if response.text
                    else f"Status {response.status_code}"
                )
                logger.error(f"API request failed: {error_detail}")
                sys.stderr.flush()
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}: {error_detail}",
                }

            result = response.json()
            content = result["choices"][0]["message"]["content"]
            usage_info = result.get("usage", {})

            logger.info(
                f"OpenAI API completion successful. Tokens: {usage_info.get('total_tokens', 'unknown')}"
            )
            sys.stderr.flush()

            return {"success": True, "data": content, "usage": usage_info}

        except Exception as e:
            logger.error(f"Requests fallback error: {e}")
            sys.stderr.flush()
            return {"success": False, "error": f"Request failed: {str(e)}"}


def parse_json_response(content: str) -> Optional[Dict[str, Any]]:
    """Parse JSON from AI response, handling various formats.

    Attempts to extract JSON from:
    1. Plain JSON object
    2. JSON wrapped in markdown code blocks
    3. JSON embedded in text

    Args:
        content: Raw response content from AI

    Returns:
        Parsed JSON dict if successful, None otherwise

    Note:
        Returns a special dict with key "_model_instruction_failure" = True
        if the response appears to be plain text (not JSON) - this indicates
        the model didn't follow JSON format instructions.
    """
    if not content or not content.strip():
        return None

    trimmed = content.strip()

    try:
        # First try direct parsing
        return json.loads(trimmed)
    except json.JSONDecodeError:
        pass

    try:
        # Try to extract from markdown code blocks
        if "```json" in content:
            json_match = re.search(r"```json\s*(\{.*?\})\s*```", content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))

        # Try to find any JSON object in the content
        if not trimmed.startswith("{") and not trimmed.startswith("["):
            # Check if this looks like plain text (not JSON at all)
            # If it doesn't start with { or [ and doesn't contain JSON-like structures
            json_match = re.search(r"(\{.*\})", content, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass
            else:
                # No JSON found at all - likely plain text response
                # Return special marker to indicate model instruction failure
                return {
                    "_model_instruction_failure": True,
                    "_raw_content": content[:500],
                }

    except json.JSONDecodeError:
        pass

    return None


def call_ai_analysis(
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    temperature: float = 0.3,
    json_mode: bool = True,
    required_fields: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """High-level helper for AI analysis with automatic JSON parsing.

    Args:
        system_prompt: System message with instructions
        user_prompt: User message with data to analyze
        model: Model to use (None for default)
        api_key: API key (None to use environment)
        base_url: Base URL for API endpoint (required for Ollama, optional for others)
        temperature: Sampling temperature
        json_mode: Whether to request JSON output
        required_fields: List of required fields in JSON response

    Returns:
        Dict with keys:
            - success: bool
            - data: dict (parsed JSON if success=True)
            - usage: dict (token usage if available)
            - error: str (if success=False)
    """
    client = AIClient(api_key=api_key, model=model, base_url=base_url)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    result = client.chat_completion(
        messages=messages, temperature=temperature, json_mode=json_mode
    )

    if not result["success"]:
        return result

    # Parse JSON response
    content = result["data"]
    parsed = parse_json_response(content)

    if parsed is None:
        logger.error("Failed to parse AI response as JSON")
        return {
            "success": False,
            "error": f"Malformed JSON in AI response. Content: {content[:500]}",
        }

    # Check if model failed to follow JSON instructions (returned plain text)
    if isinstance(parsed, dict) and parsed.get("_model_instruction_failure"):
        raw_content = parsed.get("_raw_content", content[:500])
        # Determine provider and model name from model parameter
        provider = "unknown"
        model_name = model or "unknown"
        if model:
            if "/" in model:
                parts = model.split("/", 1)
                provider = parts[0].lower()
                model_name = parts[1] if len(parts) > 1 else model
            elif model.startswith("ollama/"):
                provider = "ollama"
                model_name = model.replace("ollama/", "")

        if provider == "ollama":
            error_msg = (
                f'The Ollama model "{model_name}" did not follow JSON format instructions. '
                f"This model may not be capable enough for structured responses.\n\n"
                f"Try using a more capable model like:\n"
                f"• llama3.2 (or newer)\n"
                f"• mistral\n"
                f"• mixtral\n"
                f"• qwen2.5\n\n"
                f"Smaller models often struggle with strict JSON formatting.\n\n"
                f"Response preview: {raw_content}"
            )
        else:
            error_msg = (
                f'The AI model "{model_name}" did not follow JSON format instructions. '
                f"The model returned plain text instead of JSON.\n\n"
                f"Response preview: {raw_content}"
            )

        logger.error(f"Model instruction failure: {error_msg}")
        return {
            "success": False,
            "error": error_msg,
        }

    # Validate required fields if specified
    if required_fields:
        missing_fields = [field for field in required_fields if field not in parsed]
        if missing_fields:
            logger.error(f"AI response missing required fields: {missing_fields}")
            return {
                "success": False,
                "error": f"Missing required fields: {', '.join(missing_fields)}",
            }

    return {"success": True, "data": parsed, "usage": result.get("usage", {})}
