import { useState } from 'react';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { PrimaryButton } from './components/PrimaryButton';
import { PromoBanner } from './components/PromoBanner';
import { SettingsDialog } from './components/SettingsDialog';
import { Timer } from './components/Timer';
import { TodoList } from './components/TodoList';
import { UserCard } from './components/UserCard';

export function App() {
  const [showPromo, setShowPromo] = useState(false);

  return (
    <>
      <Navbar />
      <div className="page">
        <section data-section="tailwind">
          <p className="section-label">Tailwind</p>
          <Hero />
        </section>

        <section data-section="css-modules">
          <p className="section-label">CSS Modules</p>
          <UserCard name="Ada Lovelace" role="Staff Engineer" team="Platform" />
        </section>

        <section data-section="styled-components">
          <p className="section-label">styled-components</p>
          <PrimaryButton onClick={() => setShowPromo((shown) => !shown)}>
            {showPromo ? 'Hide promo' : 'Show promo'}
          </PrimaryButton>
        </section>

        <section data-section="conditional">
          <p className="section-label">Conditional</p>
          {showPromo ? <PromoBanner /> : <p data-testid="promo-hidden">Promo is hidden.</p>}
        </section>

        <section data-section="mui">
          <p className="section-label">MUI</p>
          <SettingsDialog />
        </section>

        <section data-section="timer">
          <p className="section-label">Re-renders every second</p>
          <Timer />
        </section>

        <section data-section="list">
          <p className="section-label">List from state</p>
          <TodoList />
        </section>
      </div>
    </>
  );
}
