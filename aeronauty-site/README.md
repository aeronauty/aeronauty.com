# Aeronauty - Next.js + Tailwind + MDX + Plotly Starter ✈️

A modern, feature-rich Next.js starter template perfect for data-driven blogs, documentation sites, and interactive content.

## 🚀 Features

- **Next.js 15** with App Router and TypeScript
- **TailwindCSS** with Typography plugin for beautiful styling
- **MDX** support for rich content authoring with React components
- **Plotly.js** for interactive data visualizations
- **Framer Motion** for smooth animations and micro-interactions
- **shadcn/ui** ready configuration
- **ESLint** for code quality
- **Vercel-ready** deployment configuration

## 🛠️ Tech Stack

- [Next.js 15](https://nextjs.org/) - React framework with App Router
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
- [MDX](https://mdxjs.com/) - Markdown with JSX support
- [Plotly.js](https://plotly.com/javascript/) - Interactive charts and graphs
- [Framer Motion](https://www.framer.com/motion/) - Production-ready motion library
- [Lucide React](https://lucide.dev/) - Beautiful icons

## 🏃‍♂️ Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo-url>
   cd aeronauty-site
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Visit [http://localhost:3000](http://localhost:3000) to see your site!

## 📁 Project Structure

```
aeronauty-site/
├── src/
│   ├── app/
│   │   ├── blog/
│   │   │   ├── hello-world/
│   │   │   │   ├── page.mdx          # Sample blog post
│   │   │   │   └── layout.tsx        # Blog post layout
│   │   │   └── page.tsx              # Blog index page
│   │   ├── globals.css               # Global styles
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Homepage
│   └── components/
│       └── PlotlyFigure.tsx          # Sample Plotly component
├── mdx-components.tsx                # MDX component overrides
├── next.config.mjs                   # Next.js configuration with MDX
├── tailwind.config.ts                # Tailwind configuration
└── package.json
```

## 📝 Creating Content

### Blog Posts

Create new blog posts as MDX files in the `src/app/blog/` directory:

```bash
mkdir src/app/blog/my-new-post
```

Create `src/app/blog/my-new-post/page.mdx`:

```mdx
import PlotlyFigure from '@/components/PlotlyFigure'

# My New Post

This is a blog post with **MDX** support!

## Interactive Chart

<PlotlyFigure />

You can embed any React component directly in your content.
```

### Custom Components

Add reusable components to `src/components/` and import them in your MDX files:

```tsx
// src/components/MyComponent.tsx
export default function MyComponent() {
  return <div>Hello from a custom component!</div>
}
```

```mdx
import MyComponent from '@/components/MyComponent'

# My Post

<MyComponent />
```

## 📊 Working with Charts

The starter includes Plotly.js for creating interactive visualizations:

```tsx
import Plot from 'react-plotly.js'

export default function MyChart() {
  return (
    <Plot
      data={[{
        x: [1, 2, 3, 4],
        y: [10, 11, 12, 13],
        type: 'scatter',
        mode: 'lines+markers',
      }]}
      layout={{ title: 'My Chart' }}
    />
  )
}
```

## 🎨 Styling

### Tailwind CSS

The project uses Tailwind CSS with the Typography plugin for beautiful prose styling:

```tsx
<article className="prose lg:prose-xl mx-auto">
  {/* Your content */}
</article>
```

### Custom Styles

Add custom styles to `src/app/globals.css` or create component-specific CSS modules.

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Deploy automatically on every push

### Other Platforms

The project works with any platform that supports Next.js:

- **Netlify**: Add `npm run build` as build command
- **Railway**: Automatic deployment from Git
- **AWS Amplify**: Connect your repository

### Build Commands

```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file for environment-specific variables:

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### Customization

- **Colors**: Edit `tailwind.config.ts` to customize the color palette
- **Typography**: Modify `mdx-components.tsx` to style MDX elements
- **Layout**: Update `src/app/layout.tsx` for global layout changes

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [MDX Documentation](https://mdxjs.com/)
- [Plotly.js Documentation](https://plotly.com/javascript/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Framer Motion Documentation](https://www.framer.com/motion/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ for the data visualization community