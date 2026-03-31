export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Override the dashboard layout's background — login gets a plain dark bg
  return (
    <div className="fixed inset-0 z-40 bg-gray-950">
      {children}
    </div>
  );
}
