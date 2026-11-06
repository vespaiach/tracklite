function firstCharacter(word: string) {
  return [...word][0] ?? "";
}

export function initials(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  const last = words.length > 1 ? firstCharacter(words[words.length - 1]) : "";
  return (firstCharacter(words[0]) + last).toUpperCase();
}

export function memberSummary(member: { username: string; fullName: string; deactivatedAt: Date | null }) {
  return {
    username: member.username,
    fullName: member.fullName,
    initials: initials(member.fullName),
    deactivated: member.deactivatedAt !== null,
  };
}