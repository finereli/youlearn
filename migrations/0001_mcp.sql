-- pwa-kit: mcp/db/mcp.sql v1
-- MCP over OAuth 2.1: dynamic client registration, authorization code with PKCE, rotating refresh tokens.
-- The account that approved an agent is `sub` on every token, so the agent works as that account. A single-owner app
-- can store a constant there (e.g. 'owner'). Tokens are stored as sha256 hashes, never raw.
CREATE TABLE IF NOT EXISTS mcp_clients (
  id TEXT PRIMARY KEY,
  name TEXT,
  redirect_uris TEXT NOT NULL,     -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mcp_pending (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  code_challenge TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mcp_tokens (
  hash TEXT PRIMARY KEY,           -- sha256 of the token, base64url
  kind TEXT NOT NULL,              -- code | access | refresh
  client_id TEXT NOT NULL,
  sub TEXT NOT NULL,               -- the account that approved
  redirect_uri TEXT,
  code_challenge TEXT,
  expires_at INTEGER NOT NULL,     -- epoch seconds
  last_used TEXT
);
CREATE INDEX IF NOT EXISTS mcp_tokens_sub ON mcp_tokens (sub, kind);
