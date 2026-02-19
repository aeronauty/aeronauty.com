# Aeronauty.com

Personal website for Harry Smith - aerodynamicist, systems engineer, and builder of tools that make complex aerospace problems tractable.

## What's Here

- 🎨 Modern, animated UI with gradient backgrounds and smooth transitions
- 💻 Code snippets for CFD workflows, optimization, and interactive visualization  
- 🚀 Project showcase featuring aerospace research, decision tools, and educational content
- ✈️ About section covering experience in rotor/propeller aerodynamics, GPU-accelerated CFD, and systems-level optimization
- 📱 Fully responsive design
- 🔬 Interactive [Lift Explainer Demo](https://github.com/aeronauty/LiftExplainer) integrated as a submodule

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Syntax Highlighting**: react-syntax-highlighter
- **Data Visualization**: Recharts
- **State Management**: Zustand
- **Validation**: Zod

## Getting Started

### Installation

```bash
npm install
```

### Initialize Submodules

The LiftExplainer project is included as a git submodule. After cloning, initialize it:

```bash
git submodule update --init --recursive
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The Panel Code / Lift Explainer demo is available at [http://localhost:3000/apps/panel-code](http://localhost:3000/apps/panel-code)

### Build for Production

```bash
npm run build
npm start
```

## Customization

- Update your actual links in `/app/about/page.tsx` (GitHub, YouTube, LinkedIn, email)
- Add more code snippets in `/app/snippets/page.tsx`
- Update project details in `/app/projects/page.tsx`
- Modify color schemes in `tailwind.config.ts`

## Project Structure

```
aeronauty_dot_com/
├── app/                      # Next.js app router pages
│   ├── about/               # About page
│   ├── apps/
│   │   └── panel-code/      # Lift Explainer integrated app
│   │       ├── components/  # EttTab, PanelTab, TrefftzTab
│   │       └── page.tsx     # Main panel code page
│   ├── projects/            # Projects showcase
│   └── snippets/            # Code snippets
├── components/              # Shared components
│   ├── ui/                  # UI components from LiftModel
│   │   ├── Card.tsx
│   │   ├── NavTabs.tsx
│   │   ├── RechartsLine.tsx
│   │   ├── SliderLabeled.tsx
│   │   ├── StreamlinesCanvas.tsx
│   │   └── Toggle.tsx
│   ├── CodeSnippetPreview.tsx
│   ├── Hero.tsx
│   └── ProjectCard.tsx
├── lib/                     # Library code from LiftModel
│   ├── ett/                 # Equal transit time model
│   ├── panels/              # Panel method implementation
│   │   ├── geometry.ts      # NACA airfoil generation
│   │   ├── influence.ts     # Hess-Smith influence kernels
│   │   ├── solver.ts        # Panel method solver
│   │   ├── stream.ts        # Streamline tracing
│   │   └── types.ts         # Type definitions
│   └── store.ts             # Zustand state management
└── submodules/
    └── LiftExplainer/           # Git submodule (source of truth)
```

## License

MIT

