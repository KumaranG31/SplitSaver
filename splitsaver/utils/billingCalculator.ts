export const splitEqually = (total: number, people: number): number[] => {
  if (people <= 0) return [];
  // Work in cents to avoid floating errors
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / people);
  const remainder = totalCents - base * people;
  const shares = Array(people).fill(base / 100);
  if (remainder > 0) {
    shares[people - 1] = (base + remainder) / 100;
  }
  return shares;
};
