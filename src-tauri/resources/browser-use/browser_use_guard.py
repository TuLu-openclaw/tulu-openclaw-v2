"""OpenClaw-wide security boundary around the official browser-use MCP server."""

from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
import sys
from contextlib import AsyncExitStack
from urllib.parse import urlparse

from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client
from mcp.server import InitializationOptions, NotificationOptions, Server
import mcp.server.stdio

READ_ONLY_TOOLS = {
    "browser_navigate", "browser_get_state", "browser_extract_content",
    "browser_get_html", "browser_screenshot", "browser_scroll",
    "browser_go_back", "browser_list_tabs", "browser_switch_tab",
    "browser_close_tab", "browser_list_sessions", "browser_close_session",
    "browser_close_all",
}
INTERACTION_TOOLS = {"browser_click", "browser_type"}
AUTONOMOUS_TOOLS = {"retry_with_browser_use_agent"}
LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost"}


def enabled(name: str) -> bool:
    return os.getenv(name, "0").lower() in {"1", "true", "yes", "on"}


def allowed_tools() -> set[str]:
    tools = set(READ_ONLY_TOOLS)
    if enabled("XINGSHU_BROWSER_ALLOW_INTERACTION"):
        tools.update(INTERACTION_TOOLS)
    if enabled("XINGSHU_BROWSER_ALLOW_AUTONOMOUS"):
        tools.update(AUTONOMOUS_TOOLS)
    return tools


def configured_domains() -> tuple[str, ...]:
    return tuple(
        item.strip().lower().rstrip(".")
        for item in os.getenv("BROWSER_USE_ALLOWED_DOMAINS", "").split(",")
        if item.strip()
    )


def domain_allowed(host: str, domains: tuple[str, ...] | None = None) -> bool:
    domains = configured_domains() if domains is None else domains
    return not domains or any(host == domain or host.endswith(f".{domain}") for domain in domains)


def validate_public_url(raw: str) -> None:
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only public http:// and https:// URLs without embedded credentials are allowed")
    host = parsed.hostname.rstrip(".").lower()
    if host in LOCAL_HOSTNAMES or host.endswith(".local"):
        raise ValueError("Local and private network URLs are blocked")
    if not domain_allowed(host):
        raise ValueError(f"Destination is outside the configured domain allowlist: {host}")
    try:
        addresses = {ipaddress.ip_address(host)}
    except ValueError:
        try:
            addresses = {
                ipaddress.ip_address(item[4][0])
                for item in socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
            }
        except socket.gaierror as exc:
            raise ValueError(f"Unable to resolve destination host: {host}") from exc
    if any(not address.is_global for address in addresses):
        raise ValueError("Local, private, link-local and reserved addresses are blocked")


class GuardedBrowserUseServer:
    def __init__(self) -> None:
        self.server = Server("xingshu-browser-automation")
        self.upstream: ClientSession | None = None
        self._setup_handlers()

    def _setup_handlers(self) -> None:
        @self.server.list_tools()
        async def list_tools() -> list[types.Tool]:
            assert self.upstream is not None
            result = await self.upstream.list_tools()
            permitted = allowed_tools()
            return [tool for tool in result.tools if tool.name in permitted]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict | None) -> list[types.ContentBlock]:
            if name not in allowed_tools():
                raise ValueError(f"Browser tool is disabled by product policy: {name}")
            payload = dict(arguments or {})
            if name == "browser_navigate":
                validate_public_url(str(payload.get("url", "")))
            if name == "retry_with_browser_use_agent":
                product_domains = configured_domains()
                requested = tuple(str(item).strip().lower().rstrip(".") for item in payload.get("allowed_domains") or [])
                if requested and any(not domain_allowed(domain, product_domains) for domain in requested):
                    raise ValueError("Autonomous agent requested a domain outside the product allowlist")
                payload["allowed_domains"] = list(requested or product_domains)
            assert self.upstream is not None
            return (await self.upstream.call_tool(name, payload)).content

    async def run(self) -> None:
        params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "browser_use.mcp"],
            env=dict(os.environ),
        )
        async with AsyncExitStack() as stack:
            read, write = await stack.enter_async_context(stdio_client(params))
            self.upstream = await stack.enter_async_context(ClientSession(read, write))
            await self.upstream.initialize()
            client_read, client_write = await stack.enter_async_context(mcp.server.stdio.stdio_server())
            await self.server.run(
                client_read,
                client_write,
                InitializationOptions(
                    server_name="xingshu-browser-automation",
                    server_version="1.0.0",
                    capabilities=self.server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )


if __name__ == "__main__":
    asyncio.run(GuardedBrowserUseServer().run())
