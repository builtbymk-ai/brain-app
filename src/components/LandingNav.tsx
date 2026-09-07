import Link from 'next/link';

export function LandingNav() {
  return (
    <header className="nav" role="banner">
      <nav className="nav-inner" aria-label="Main navigation">
        <Link href="#top" className="nav-logo" aria-label="BRAIN home">
          <span className="nav-logo-mark" aria-hidden="true">
            B
          </span>
          <span className="nav-logo-text">BRAIN</span>
        </Link>
        <div className="nav-links">
          <a href="#who">Who It&apos;s For</a>
          <a href="#research">Research</a>
          <a href="#sources">Sources</a>
          <a href="#about">About</a>
          <a href="#roadmap">Roadmap</a>
        </div>
        <Link href="/research" className="nav-cta">
          Use BRAIN
        </Link>
      </nav>
    </header>
  );
}
