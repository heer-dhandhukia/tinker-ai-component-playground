import type { ReactNode } from 'react';
import styled from 'styled-components';

const StyledButton = styled.button`
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-md);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--color-primary-strong);
  }
`;

export interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
}

export function PrimaryButton({ children, onClick }: PrimaryButtonProps) {
  return (
    <StyledButton type="button" onClick={onClick}>
      {children}
    </StyledButton>
  );
}
