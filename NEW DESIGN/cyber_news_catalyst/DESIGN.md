---
name: Cyber News Catalyst
colors:
  surface: '#091422'
  surface-dim: '#091422'
  surface-bright: '#303a4a'
  surface-container-lowest: '#050e1d'
  surface-container-low: '#121c2b'
  surface-container: '#16202f'
  surface-container-high: '#212a3a'
  surface-container-highest: '#2b3545'
  on-surface: '#d9e3f8'
  on-surface-variant: '#bbc9ce'
  inverse-surface: '#d9e3f8'
  inverse-on-surface: '#273140'
  outline: '#859398'
  outline-variant: '#3c494e'
  surface-tint: '#39d7ff'
  primary: '#a1e7ff'
  on-primary: '#003642'
  primary-container: '#00d2fc'
  on-primary-container: '#005669'
  inverse-primary: '#00677d'
  secondary: '#b7c4ff'
  on-secondary: '#002682'
  secondary-container: '#0046dc'
  on-secondary-container: '#c0cbff'
  tertiary: '#d3dbff'
  on-tertiary: '#1f2e59'
  tertiary-container: '#b0bff3'
  on-tertiary-container: '#3e4d79'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b3ebff'
  primary-fixed-dim: '#39d7ff'
  on-primary-fixed: '#001f27'
  on-primary-fixed-variant: '#004e5f'
  secondary-fixed: '#dde1ff'
  secondary-fixed-dim: '#b7c4ff'
  on-secondary-fixed: '#001452'
  on-secondary-fixed-variant: '#0038b6'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#b6c5f9'
  on-tertiary-fixed: '#061943'
  on-tertiary-fixed-variant: '#364571'
  background: '#091422'
  on-background: '#d9e3f8'
  surface-variant: '#2b3545'
  neon-cyan: '#00D2FC'
  deep-space: '#010816'
  circuit-blue: '#0046DD'
  void-navy: '#02143F'
  glow-cyan: rgba(0, 210, 252, 0.35)
  glass-surface: rgba(2, 20, 63, 0.6)
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Sora
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  headline-md:
    fontFamily: Sora
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  max-width: 1440px
---

## Brand & Style

The design system is engineered for a high-octane, future-forward news platform. It targets tech enthusiasts, developers, and industry disruptors who demand real-time information within an environment that reflects the cutting-edge nature of their interests. The brand personality is authoritative yet experimental, evoking a sense of "intelligence in the machine."

The visual style is **Modern / Technological** with heavy influences from **Glassmorphism** and **High-Contrast / Bold** aesthetics. It utilizes deep, multi-layered navy backgrounds to create a sense of infinite digital space. This is punctuated by "neon-glass" surfaces and high-intensity cyan light sources. The UI should feel like a high-end command center—sleek, dark, and glowing with live data.

## Colors

The palette is optimized for a **Dark Mode** first experience, ensuring high-energy visuals without sacrificing readability. **Void Navy (#02143F)** and **Deep Space (#010816)** form the foundation, providing a rich, high-contrast base for content. 

**Neon Cyan (#00D2FC)** is the primary functional and accent color. It is used for critical interactive elements, borders of active containers, and typography highlights. Its high luminance against the dark background ensures accessibility and a "high-tech" glow. **Circuit Blue (#0046DD)** acts as a supporting secondary color for lower-priority actions and subtle gradients, bridging the gap between the deep backgrounds and the vibrant cyan accents. White is used sparingly and often tinted with 5% Cyan to maintain the cool, futuristic temperature of the interface.

## Typography

This design system uses a tri-font strategy to reinforce the technological narrative. **Sora** is used for headlines; its geometric and wide stance gives titles a futuristic, high-end feel. **Hanken Grotesk** handles the body copy, providing exceptional legibility for long-form news articles in a dark environment. **JetBrains Mono** is utilized for labels, metadata, and "live" indicators to evoke a developer/terminal aesthetic.

Typography for headlines should often leverage the **Neon Cyan** color for "Breaking News" or "Featured" tags to maximize impact. Body text should be kept at a high-contrast off-white (e.g., #E2E8F0) to reduce eye strain against the navy background.

## Layout & Spacing

The layout follows a **Fluid Grid** model with strict maximum constraints to ensure data-heavy news feeds remain organized. 

- **Desktop:** 12-column grid with a 1440px max-width. Gutters are kept wide at 24px to prevent visual clutter in the dark, glowing UI.
- **Tablet:** 8-column grid with 20px gutters.
- **Mobile:** 4-column grid with 16px gutters and 16px margins.

The spacing rhythm is based on a 4px system. Large vertical gaps are encouraged between different news categories to allow the "glow" from one section's borders to bleed naturally without overlapping with another, maintaining the atmospheric depth.

## Elevation & Depth

Visual hierarchy is achieved through **Glassmorphism** and **High-Tech Glow Effects**. Rather than traditional shadows, depth is conveyed through:

1.  **Backdrop Blurs:** Surfaces use a semi-transparent Navy (#02143F) with a 12px-20px backdrop blur to sit above the main background.
2.  **Inner Glows:** Elevated cards feature a subtle 1px inner border in Cyan (#00D2FC) at 20% opacity.
3.  **Neon Outlines:** Active or featured elements use a crisp 1.5px Neon Cyan border with a matching external drop shadow (blur: 10px, spread: -2px) to simulate a light-emissive effect.
4.  **Tonal Tiers:** The background uses a subtle radial gradient from Deep Space (#010816) in the center to Void Navy (#02143F) at the edges to create a sense of immersion.

## Shapes

The shape language is **Rounded**, moving away from the previous "Soft" style to a more contemporary, fluid feel. The 0.5rem (8px) base radius for buttons and inputs creates a sophisticated, modern silhouette.

Larger containers like article cards or video players should utilize `rounded-xl` (1.5rem) to embrace the "liquid tech" aesthetic. This increased roundness provides a necessary contrast to the sharp, monospaced metadata typography.

## Components

### Buttons
Primary buttons are solid Neon Cyan with dark Deep Space text, featuring a "pulse" glow effect on hover. Secondary buttons use a transparent background with a 1.5px Cyan border.

### Input Fields
Inputs utilize a dark, semi-transparent base. Upon focus, the border glows Neon Cyan, and the label (in JetBrains Mono) shifts to a bright Cyan highlight.

### News Cards
Cards are treated as "Glass" panels. They feature a 1px border that is nearly invisible until hovered, at which point it glows with a Cyan gradient. The imagery within cards should have a subtle dark overlay to ensure headline readability.

### Live Indicators
Live news badges must use a pulsing animation. A small Neon Cyan circle with a radiating glow effect, accompanied by uppercase JetBrains Mono text.

### Progress Bars / Data Viz
Charts and progress bars should use gradients from Circuit Blue to Neon Cyan, appearing like glowing fiber-optic lines.