# LLM Human Relay

## Boundary

Human relay sits between product LLM calls and the external provider API. When enabled, outbound `invoke` / `stream` / `batch` calls pause, surface the prompt to the UI, and resume only after the user pastes an external model response.

This is a transport / power-user mode. It must not become keyword routing for product intent, and it must not replace Prompt Registry or structured-output contracts.

## Ownership

| Piece | Path |
|---|---|
| Settings key | `llm.humanRelay.enabled` |
| Pending wait / resolve | `HumanRelayService` |
| Decorator | `attachLLMHumanRelay` (outermost wrap in `createLLMFromResolvedOptions`) |
| HTTP / SSE | `/api/llm/human-relay/*` |
| UI | Settings toggle + global `HumanRelayDialog` |

## Rules

- Disabled by default.
- When enabled, wait outside the request limiter so long human waits do not hold concurrency slots.
- When enabled, `runWithEnforcedTimeout` skips provider request timeouts so paste waits are not auto-killed; intentional AbortSignal still cancels.
- Cancel must reject the waiter (`HumanRelayCancelledError`); AbortSignal must also cancel.
- Closing the relay setting cancels all pending waiters.
- Pasted text is returned as a synthetic `AIMessage` / stream chunk; structured JSON parse and repair still run downstream.
- Auto-director / multi-call flows will pop many dialogs; warn users in settings copy.

## Related

- Prompt log observes requests but does not block them.
- AI live (`llm-live`) is preview-only and does not accept pasted responses.
