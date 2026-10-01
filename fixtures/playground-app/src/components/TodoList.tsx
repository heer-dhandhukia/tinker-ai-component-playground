import { useState } from 'react';

interface Todo {
  id: number;
  label: string;
}

const INITIAL: Todo[] = [
  { id: 1, label: 'Review pull request' },
  { id: 2, label: 'Update changelog' },
  { id: 3, label: 'Plan sprint' },
  { id: 4, label: 'Write release notes' },
];

export function TodoList() {
  const [todos, setTodos] = useState(INITIAL);
  const [nextId, setNextId] = useState(INITIAL.length + 1);

  const add = () => {
    setTodos((items) => [...items, { id: nextId, label: `New task ${nextId}` }]);
    setNextId((id) => id + 1);
  };
  const reverse = () => setTodos((items) => [...items].reverse());
  const removeFirst = () => setTodos((items) => items.slice(1));

  return (
    <div className="todo-list">
      <ul data-testid="todo-items">
        {todos.map((todo) => (
          <TodoItem key={todo.id} label={todo.label} />
        ))}
      </ul>
      <button type="button" onClick={add}>
        Add
      </button>{' '}
      <button type="button" onClick={reverse}>
        Reverse order
      </button>{' '}
      <button type="button" onClick={removeFirst}>
        Remove first
      </button>
    </div>
  );
}

function TodoItem({ label }: { label: string }) {
  return <li className="todo-item">{label}</li>;
}
