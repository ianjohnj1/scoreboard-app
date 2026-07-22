ALTER ROLE authenticator SET pgrst.server_cors_allowed_origins = '"https://scorekeeper-pro-d49.pages.dev, http://localhost:5173"';
NOTIFY pgrst, 'reload config';
