import { useEffect, useState } from 'react';

/** Re-renders once a second so Tinker's overrides have to survive React updates. */
export function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="timer" data-testid="timer">
      Open for <strong>{seconds}</strong>s
    </p>
  );
}
