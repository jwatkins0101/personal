// Negative fixture for gate:answered-mail: never treats anything as answered.
export async function dropAnswered<T>(items: T[]) { return { kept: items, answered: [] as { item: T; reply: { sentId: string; at: string } }[] }; }
