import styles from './UserCard.module.css';

export interface UserCardProps {
  name: string;
  role: string;
  team: string;
}

export function UserCard({ name, role, team }: UserCardProps) {
  return (
    <article className={styles.card}>
      <h2 className={styles.title}>{name}</h2>
      <p className={styles.role}>{role}</p>
      <span className={styles.badge}>{team}</span>
    </article>
  );
}
