## 2024-05-16 - [React Render Optimization in Chat]
**Learning:** In chat interfaces, active streams or typing indicators cause the main parent component to re-render. If message items in the long list are not memoized, this causes O(n) re-renders for every character typed or step updated, which becomes a severe bottleneck as the conversation grows.
**Action:** Always wrap list items in `React.memo` (or equivalent) in chat UIs where the parent frequently updates state like `typing` or streaming status.
