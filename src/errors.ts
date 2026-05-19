export class CofounderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CofounderError";
  }
}

export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new CofounderError(message);
  }
}
