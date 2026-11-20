// Re-mounts on every navigation, so each page fades in (CSS only; skipped for reduced motion).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
