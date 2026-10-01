export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('');
  return <span className="avatar">{initials}</span>;
}
