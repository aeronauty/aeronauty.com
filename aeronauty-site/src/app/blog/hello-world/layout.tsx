export default function BlogPostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <article className="bg-white rounded-xl shadow-lg p-8 prose prose-lg max-w-none">
          {children}
        </article>
      </div>
    </div>
  )
}
