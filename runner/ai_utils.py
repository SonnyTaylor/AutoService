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

logger = logging.getLogger(__name__)

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
            model: Model name (e.g., "gpt-4-turbo-preview", "claude-3-sonnet-20240229").
                   If None, defaults to "gpt-4-turbo-preview".
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
        self.model = model or "gpt-4-turbo-preview"

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
            provider_prefix = self.model.split("/")[0].upper()
            if provider_prefix == "OPENAI":
                os.environ["OPENAI_API_KEY"] = self.api_key
            elif provider_prefix == "ANTHROPIC":
                os.environ["ANTHROPIC_API_KEY"] = self.api_key
            # Add more providers as needed

            logger.info(f"Initialized AI client with LiteLLM, model: {self.model}")
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
        if not self.api_key:
            return {
                "success": False,
                "error": "No API key configured. Set OPENAI_API_KEY environment variable.",
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
            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "timeout": self.timeout,
            }

            if max_tokens is not None:
                kwargs["max_tokens"] = max_tokens

            # Enable JSON mode if requested (provider-specific handling)
            if json_mode:
                # Different providers handle JSON mode differently
                provider = self.model.split("/")[0].lower()
                if provider in ["openai", "azure"]:
                    kwargs["response_format"] = {"type": "json_object"}
                # Anthropic and others may need different approaches
                # For now, we'll rely on system messages to request JSON

            logger.info(f"Calling LiteLLM with model: {self.model}")
            sys.stderr.flush()

            response = litellm.completion(**kwargs)

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
    """
    try:
        # First try direct parsing
        return json.loads(content.strip())
    except json.JSONDecodeError:
        pass

    try:
        # Try to extract from markdown code blocks
        if "```json" in content:
            json_match = re.search(r"```json\s*(\{.*?\})\s*```", content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))

        # Try to find any JSON object in the content
        if not content.strip().startswith("{"):
            json_match = re.search(r"(\{.*\})", content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))

    except json.JSONDecodeError:
        pass

    return None


def call_ai_analysis(
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
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
    client = AIClient(api_key=api_key, model=model)

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
