# Session service

Owns table session lifecycle, participants, Redis-backed presence, and WebSocket fan-out. Consumes cart updates to broadcast changes; it never owns durable cart state.
