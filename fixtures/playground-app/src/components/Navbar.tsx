import './Navbar.scss';

const LINKS = ['Dashboard', 'Projects', 'Team'];

export function Navbar() {
  return (
    <nav className="navbar">
      <span className="navbar__brand">Playground</span>
      <ul className="navbar__links">
        {LINKS.map((link, index) => (
          <li key={link}>
            <a
              href="#"
              className={index === 0 ? 'navbar__link navbar__link--active' : 'navbar__link'}
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
