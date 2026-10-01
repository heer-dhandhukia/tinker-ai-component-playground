import { Avatar } from './Avatar';
import { Badge } from './Badge';

export interface ProfileCardProps {
  name: string;
  title: string;
}

export function ProfileCard({ name, title }: ProfileCardProps) {
  return (
    <div className="profile-card">
      <Avatar name={name} />
      <div>
        <h2 className="profile-card__name">{name}</h2>
        <Badge label={title} />
      </div>
    </div>
  );
}
